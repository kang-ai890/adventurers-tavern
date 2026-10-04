import { prisma, type Player } from "@tavern/database";
import {
  ENERGY_MAX,
  ENERGY_REGEN_MINUTES,
  GATHER_ENERGY_COST,
  GATHER_TABLES,
  KILL_SCORE_MAX,
  PK_DEFEAT_LOOT_RATIO,
  PK_KILL_SCORE_PER_ATTACK,
  PK_LOOT_BASE_RATIO,
  PK_LOOT_MAX,
  PK_LOOT_MIN,
  PK_LOOT_REALM_STEP,
  PK_MAX_ATTACKS_PER_DAY,
  PK_REQUIRE_LEVEL,
  PK_SAME_TARGET_COOLDOWN_MINUTES,
  PK_SAME_TARGET_DAILY_LIMIT,
  RED_NAME_DECAY_PER_HOUR,
  BOUNTY_KILL_SCORE_REDUCTION,
  bountyOf,
  isGatherItem,
  realmIndex,
  realmOfLevel,
  type AttackResultDto,
  type BountyEntryDto,
  type GatherResultDto,
  type GatherSpotType,
  type LootEntryDto,
  type WildDto,
  type WildPlayerDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";
import { addExp } from "./leveling.js";

/**
 * 野外生态：采集 + 自由PK + 红名悬赏（阶段6）
 * 说明：野外同屏实时移动在阶段7（地图渲染）实现；
 * 本阶段采用"在野名单 + 异步袭击结算"，规则数值与设计文档 §6/§11 一致。
 */

// ---------- 在野名单（内存态，10 分钟未操作自动离场） ----------
const wildPresence = new Map<string, number>(); // playerId -> lastActiveAt

function touchPresence(playerId: string) {
  wildPresence.set(playerId, Date.now());
}

function prunePresence() {
  const now = Date.now();
  for (const [id, at] of wildPresence) {
    if (now - at > 10 * 60_000) wildPresence.delete(id);
  }
}

// ---------- 袭击冷却（内存态：同目标冷却 + 每日次数） ----------
const attackCooldowns = new Map<string, number>(); // `${attackerId}:${victimId}` -> lastAt
const dailyAttacks = new Map<string, { date: string; total: number; targets: Map<string, number> }>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- 体力 ----------

export async function regenEnergy(player: Player): Promise<Player> {
  const elapsedMin = Math.floor((Date.now() - player.energyUpdatedAt.getTime()) / 60_000);
  if (elapsedMin >= ENERGY_REGEN_MINUTES && player.energy < ENERGY_MAX) {
    const gained = Math.min(ENERGY_MAX - player.energy, Math.floor(elapsedMin / ENERGY_REGEN_MINUTES));
    if (gained > 0) {
      return prisma.player.update({
        where: { id: player.id },
        data: { energy: { increment: gained }, energyUpdatedAt: new Date() },
      });
    }
  }
  return player;
}

// ---------- 杀孽衰减（-1/小时，惰性结算） ----------

export async function applyKillScoreDecay(player: Player): Promise<Player> {
  if (player.killScore <= 0) return player;
  const base = player.killScoreUpdatedAt ?? player.updatedAt;
  const hours = Math.floor((Date.now() - base.getTime()) / 3_600_000);
  if (hours <= 0) return player;
  const reduced = Math.max(0, player.killScore - Math.floor(hours * RED_NAME_DECAY_PER_HOUR));
  if (reduced === player.killScore) return player;
  return prisma.player.update({
    where: { id: player.id },
    data: { killScore: reduced, killScoreUpdatedAt: new Date() },
  });
}

// ---------- 野外状态 ----------

export async function getWild(player: Player): Promise<WildDto> {
  prunePresence();
  const p = await regenEnergy(player);

  // 悬赏榜：先对红名玩家做杀孽惰性衰减（-1/小时，离线亦计），再出榜
  const rawRed = await prisma.player.findMany({
    where: { killScore: { gt: 0 } },
    orderBy: { killScore: "desc" },
    take: 20,
  });
  const decayedRed = await Promise.all(rawRed.map((r) => applyKillScoreDecay(r)));
  const redPlayers = decayedRed.filter((r) => r.killScore > 0).sort((a, b) => b.killScore - a.killScore);
  const bounty: BountyEntryDto[] = redPlayers.map((r) => ({
    playerId: r.id,
    nickname: r.nickname,
    realm: realmOfLevel(r.level),
    killScore: r.killScore,
    bounty: bountyOf(r.killScore, realmOfLevel(r.level)),
  }));

  const wildIds = [...wildPresence.keys()].filter((id) => id !== player.id);
  const wildRows = wildIds.length
    ? await prisma.player.findMany({ where: { id: { in: wildIds } } })
    : [];
  const wildDecayed = await Promise.all(wildRows.map((w) => (w.killScore > 0 ? applyKillScoreDecay(w) : w)));
  const wildPlayers: WildPlayerDto[] = wildDecayed.map((w) => ({
    playerId: w.id,
    nickname: w.nickname,
    realm: realmOfLevel(w.level),
    level: w.level,
    red: w.killScore > 0,
  }));

  return {
    season: seasonName(),
    energy: p.energy,
    energyMax: ENERGY_MAX,
    unlocked: player.level >= PK_REQUIRE_LEVEL,
    wildPlayers,
    bounty,
  };
}

function seasonName(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

export function enterWild(player: Player): void {
  touchPresence(player.id);
}

export function leaveWild(player: Player): void {
  wildPresence.delete(player.id);
}

// ---------- 采集 ----------

export async function gather(player: Player, spotType: GatherSpotType, force = false): Promise<GatherResultDto> {
  const p = await regenEnergy(player);
  if (p.energy < GATHER_ENERGY_COST) {
    throw httpError(400, `体力不足，回客栈歇息片刻（${ENERGY_REGEN_MINUTES} 分钟回 1 点）`);
  }
  if (player.level < PK_REQUIRE_LEVEL && !force) {
    throw httpError(400, "筑基之后才能进入野外");
  }

  const table = GATHER_TABLES[spotType];
  const total = table.items.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  let picked = table.items[0];
  for (const item of table.items) {
    roll -= item.weight;
    if (roll <= 0) {
      picked = item;
      break;
    }
  }

  await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: { energy: { decrement: GATHER_ENERGY_COST }, energyUpdatedAt: new Date() },
    }),
    prisma.playerInventory.upsert({
      where: { playerId_itemId: { playerId: player.id, itemId: picked.itemId } },
      create: { playerId: player.id, itemId: picked.itemId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    }),
    prisma.gatherLog.create({
      data: { playerId: player.id, spotType, itemId: picked.itemId, quantity: 1, exp: picked.exp },
    }),
  ]);

  const levelResult = await addExp(player, picked.exp);
  touchPresence(player.id);

  return {
    spotType,
    itemId: picked.itemId,
    itemName: picked.name,
    icon: picked.icon,
    exp: picked.exp,
    energyLeft: p.energy - GATHER_ENERGY_COST,
    levelUps: levelResult.levelUps,
    newLevel: levelResult.level,
  };
}

// ---------- 袭击与讨伐 ----------

function rollWin(attacker: Player, victim: Player): boolean {
  const chance = Math.min(0.9, Math.max(0.1, 0.5 + (attacker.level - victim.level) * 0.02));
  return Math.random() < chance;
}

export async function attack(
  attacker: Player,
  victimPlayerId: string,
  force: "win" | "lose" | undefined = undefined,
): Promise<AttackResultDto> {
  const a = await applyKillScoreDecay(attacker);
  if (a.level < PK_REQUIRE_LEVEL) throw httpError(400, "筑基之后才能袭击他人");
  if (victimPlayerId === attacker.id) throw httpError(400, "不能袭击自己");

  const victimRaw = await prisma.player.findUnique({ where: { id: victimPlayerId } });
  if (!victimRaw) throw httpError(404, "目标不在野外");
  const victim = await applyKillScoreDecay(victimRaw);
  if (victim.level < PK_REQUIRE_LEVEL) throw httpError(400, "对方未筑基，受天道庇护");

  // 同目标冷却（30 分钟）
  const cdKey = `${attacker.id}:${victim.id}`;
  const lastAt = attackCooldowns.get(cdKey) ?? 0;
  if (Date.now() - lastAt < PK_SAME_TARGET_COOLDOWN_MINUTES * 60_000) {
    throw httpError(400, `刚刚袭击过他，${PK_SAME_TARGET_COOLDOWN_MINUTES} 分钟后再来吧`);
  }

  // 每日限制
  const date = todayStr();
  let day = dailyAttacks.get(attacker.id);
  if (!day || day.date !== date) {
    day = { date, total: 0, targets: new Map() };
    dailyAttacks.set(attacker.id, day);
  }
  if (day.total >= PK_MAX_ATTACKS_PER_DAY) {
    throw httpError(400, `今日袭击次数已用完（每日 ${PK_MAX_ATTACKS_PER_DAY} 次）`);
  }
  const sameTargetToday = day.targets.get(victim.id) ?? 0;
  if (sameTargetToday >= PK_SAME_TARGET_DAILY_LIMIT) {
    throw httpError(400, `同一目标每日最多袭击 ${PK_SAME_TARGET_DAILY_LIMIT} 次`);
  }

  const victimWasRed = victim.killScore > 0;
  const lootRatio = Math.min(
    PK_LOOT_MAX,
    Math.max(PK_LOOT_MIN, PK_LOOT_BASE_RATIO + (realmIndex(realmOfLevel(victim.level)) - realmIndex(realmOfLevel(attacker.level))) * PK_LOOT_REALM_STEP),
  );

  attackCooldowns.set(cdKey, Date.now());
  day.total += 1;
  day.targets.set(victim.id, sameTargetToday + 1);

  const success = force === "win" ? true : force === "lose" ? false : rollWin(attacker, victim);

  if (success) {
    // 抢夺：仅背包内野外采集物
    const victimInv = await prisma.playerInventory.findMany({ where: { playerId: victim.id } });
    const lootable = victimInv.filter((r) => isGatherItem(r.itemId) && r.quantity > 0);
    const loot: LootEntryDto[] = [];
    let bountyReward = 0;

    for (const row of lootable) {
      const take = Math.max(1, Math.floor(row.quantity * lootRatio));
      const item = await prisma.itemDef.findUnique({ where: { id: row.itemId } });
      await prisma.playerInventory.update({
        where: { id: row.id },
        data: { quantity: { decrement: take } },
      });
      await prisma.playerInventory.upsert({
        where: { playerId_itemId: { playerId: attacker.id, itemId: row.itemId } },
        create: { playerId: attacker.id, itemId: row.itemId, quantity: take },
        update: { quantity: { increment: take } },
      });
      loot.push({
        itemId: row.itemId,
        name: item?.name ?? row.itemId,
        icon: item?.icon ?? "📦",
        quantity: take,
      });
    }

    if (victimWasRed) {
      // 讨伐红名：不涨杀孽，领悬赏；红名杀孽 -50
      bountyReward = bountyOf(victim.killScore, realmOfLevel(victim.level));
      await prisma.$transaction([
        prisma.player.update({
          where: { id: attacker.id },
          data: { stones: { increment: bountyReward } },
        }),
        prisma.player.update({
          where: { id: victim.id },
          data: {
            killScore: Math.max(0, victim.killScore - BOUNTY_KILL_SCORE_REDUCTION),
            killScoreUpdatedAt: new Date(),
          },
        }),
      ]);
    } else {
      const newKillScore = Math.min(KILL_SCORE_MAX, attacker.killScore + PK_KILL_SCORE_PER_ATTACK);
      await prisma.player.update({
        where: { id: attacker.id },
        data: { killScore: newKillScore, killScoreUpdatedAt: new Date() },
      });
    }

    await prisma.attackLog.create({
      data: {
        attackerId: attacker.id,
        victimId: victim.id,
        success: true,
        victimWasRed,
        lootSnapshot: loot as unknown as object,
      },
    });

    return {
      success: true,
      victimWasRed,
      loot,
      killScoreNow: victimWasRed ? attacker.killScore : Math.min(KILL_SCORE_MAX, attacker.killScore + PK_KILL_SCORE_PER_ATTACK),
      bountyReward,
      message: victimWasRed
        ? `讨伐成功！${victim.nickname} 伏诛，你领到悬赏 ${bountyReward} 灵石${loot.length ? `，缴获战利品 ${loot.map((l) => `${l.name}×${l.quantity}`).join("、")}` : ""}`
        : `袭击得手！从 ${victim.nickname} 身上抢到 ${loot.map((l) => `${l.name}×${l.quantity}`).join("、") || "些许东西"}，杀孽 +${PK_KILL_SCORE_PER_ATTACK}（你已是红名！）`,
    };
  }

  // 袭击失败：袭击者掉 10% 采集物给对方
  const attackerInv = await prisma.playerInventory.findMany({ where: { playerId: attacker.id } });
  const lootable = attackerInv.filter((r) => isGatherItem(r.itemId) && r.quantity > 0);
  const lost: LootEntryDto[] = [];
  for (const row of lootable) {
    const give = Math.max(1, Math.floor(row.quantity * PK_DEFEAT_LOOT_RATIO));
    const item = await prisma.itemDef.findUnique({ where: { id: row.itemId } });
    await prisma.playerInventory.update({ where: { id: row.id }, data: { quantity: { decrement: give } } });
    await prisma.playerInventory.upsert({
      where: { playerId_itemId: { playerId: victim.id, itemId: row.itemId } },
      create: { playerId: victim.id, itemId: row.itemId, quantity: give },
      update: { quantity: { increment: give } },
    });
    lost.push({ itemId: row.itemId, name: item?.name ?? row.itemId, icon: item?.icon ?? "📦", quantity: give });
  }

  await prisma.attackLog.create({
    data: {
      attackerId: attacker.id,
      victimId: victim.id,
      success: false,
      victimWasRed,
      lootSnapshot: lost as unknown as object,
    },
  });

  return {
    success: false,
    victimWasRed,
    loot: lost,
    killScoreNow: attacker.killScore,
    bountyReward: 0,
    message: `偷袭失败！${victim.nickname} 反手将你击退${lost.length ? `，你丢了 ${lost.map((l) => `${l.name}×${l.quantity}`).join("、")}` : ""}（重伤 30 分钟）`,
  };
}
