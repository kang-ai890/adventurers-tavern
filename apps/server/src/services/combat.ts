import { prisma, type Equipment, type Hero, type Player } from "@tavern/database";
import {
  DUNGEONS,
  EQUIPMENT_QUALITIES,
  EQUIPMENT_SLOTS,
  HERO_DEFS,
  HERO_GROWTH,
  HERO_MAX_STAR,
  RECRUIT_JADES_COST,
  RECRUIT_JADES_POOL,
  RECRUIT_STONES_COST,
  RECRUIT_STONES_POOL,
  equipmentStats,
  getDungeon,
  getHeroDef,
  heroLevelUpCost,
  heroPower,
  starMultiplier,
  type BattleResultDto,
  type DungeonDto,
  type EquipmentDto,
  type EquipmentQuality,
  type EquipmentSlot,
  type HeroDto,
  type HeroesDto,
  type LootEntryDto,
  type RecruitResultDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";
import { addExp } from "./leveling.js";
import { regenEnergy } from "./wild.js";

/** 英雄属性 = (基础 + 每级成长×(级-1)) × 星级倍率 + 装备 */
function heroStats(hero: Hero, equipment: Equipment[]) {
  const def = getHeroDef(hero.heroId)!;
  const mult = starMultiplier(hero.star);
  const base = {
    atk: Math.round((def.atk + HERO_GROWTH.atk * (hero.level - 1)) * mult),
    def: Math.round((def.def + HERO_GROWTH.def * (hero.level - 1)) * mult),
    hp: Math.round((def.hp + HERO_GROWTH.hp * (hero.level - 1)) * mult),
    spd: Math.round((def.spd + HERO_GROWTH.spd * (hero.level - 1)) * mult),
  };
  let atk = base.atk;
  let defn = base.def;
  let hp = base.hp;
  for (const e of equipment) {
    atk += e.atk;
    defn += e.def;
    hp += e.hp;
  }
  return { ...base, atk, def: defn, hp };
}

function equipDto(e: Equipment & { hero?: Hero | null }): EquipmentDto {
  const q = EQUIPMENT_QUALITIES[e.quality as EquipmentQuality];
  const heroDef = e.hero ? getHeroDef(e.hero.heroId) : null;
  return {
    id: e.id,
    slot: e.slot as EquipmentSlot,
    quality: e.quality,
    qualityLabel: q.label,
    qualityColor: q.color,
    level: e.level,
    atk: e.atk,
    def: e.def,
    hp: e.hp,
    heroId: e.heroId,
    heroName: heroDef?.name ?? null,
  };
}

export async function getHeroes(player: Player): Promise<HeroesDto> {
  let heroes = await prisma.hero.findMany({
    where: { playerId: player.id },
    include: { equipments: { include: { hero: true } } },
    orderBy: { createdAt: "asc" },
  });

  // 新手赠送：林惊羽（2星，主线第1章）
  if (heroes.length === 0) {
    await prisma.hero.create({
      data: { playerId: player.id, heroId: "lin_jingyu", star: 2, level: 1 },
    });
    heroes = await prisma.hero.findMany({
      where: { playerId: player.id },
      include: { equipments: { include: { hero: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  const bag = await prisma.equipment.findMany({
    where: { playerId: player.id, heroId: null },
    include: { hero: true },
  });

  const heroDtos: HeroDto[] = heroes.map((h) => {
    const stats = heroStats(h, h.equipments);
    const def = getHeroDef(h.heroId)!;
    return {
      id: h.id,
      heroId: h.heroId,
      name: def.name,
      icon: def.icon,
      job: def.job,
      star: h.star,
      level: h.level,
      atk: stats.atk,
      def: stats.def,
      hp: stats.hp,
      spd: stats.spd,
      power: heroPower(stats.atk, stats.def, stats.hp),
      equipment: h.equipments.map(equipDto),
    };
  });

  return { heroes: heroDtos, bag: bag.map(equipDto) };
}

function rollWeighted<T extends { weight: number }>(pool: readonly T[]): T {
  const total = pool.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return pool[pool.length - 1];
}

export async function recruitHero(player: Player, currency: "stones" | "jades"): Promise<RecruitResultDto> {
  const cost = currency === "stones" ? RECRUIT_STONES_COST : RECRUIT_JADES_COST;
  if (currency === "stones" && player.stones < cost) throw httpError(400, `灵石招募需要 ${cost} 灵石`);
  if (currency === "jades" && player.jades < cost) throw httpError(400, `仙玉招募需要 ${cost} 仙玉`);

  const pool: readonly { star: number; weight: number }[] =
    currency === "stones" ? RECRUIT_STONES_POOL : RECRUIT_JADES_POOL;
  const star = rollWeighted(pool).star;

  // 优先招募未拥有的冒险者
  const owned = await prisma.hero.findMany({ where: { playerId: player.id } });
  const ownedIds = new Set(owned.map((h) => h.heroId));
  const candidates = HERO_DEFS.filter((h) => !ownedIds.has(h.id));
  const poolDefs = candidates.length > 0 ? candidates : HERO_DEFS;
  const def = poolDefs[Math.floor(Math.random() * poolDefs.length)];

  const hero = await prisma.hero.create({
    data: { playerId: player.id, heroId: def.id, star: Math.min(star, HERO_MAX_STAR), level: 1 },
  });
  await prisma.player.update({
    where: { id: player.id },
    data: currency === "stones" ? { stones: { decrement: cost } } : { jades: { decrement: cost } },
  });

  const stats = heroStats(hero, []);
  return {
    hero: {
      id: hero.id,
      heroId: hero.heroId,
      name: def.name,
      icon: def.icon,
      job: def.job,
      star: hero.star,
      level: 1,
      atk: stats.atk,
      def: stats.def,
      hp: stats.hp,
      spd: stats.spd,
      power: heroPower(stats.atk, stats.def, stats.hp),
      equipment: [],
    },
    cost,
    currency,
  };
}

export async function levelUpHero(player: Player, heroId: string): Promise<HeroDto> {
  const hero = await prisma.hero.findFirst({
    where: { id: heroId, playerId: player.id },
    include: { equipments: { include: { hero: true } } },
  });
  if (!hero) throw httpError(404, "冒险者不存在");
  if (hero.level >= player.level) throw httpError(400, "冒险者等级不能超过你的等级");
  const cost = heroLevelUpCost(hero.level);
  if (player.stones < cost) throw httpError(400, `升级需要 ${cost} 灵石`);

  await prisma.$transaction([
    prisma.player.update({ where: { id: player.id }, data: { stones: { decrement: cost } } }),
    prisma.hero.update({ where: { id: hero.id }, data: { level: { increment: 1 } } }),
  ]);

  const updated = await prisma.hero.findUniqueOrThrow({
    where: { id: hero.id },
    include: { equipments: { include: { hero: true } } },
  });
  const stats = heroStats(updated, updated.equipments);
  const def = getHeroDef(updated.heroId)!;
  return {
    id: updated.id,
    heroId: updated.heroId,
    name: def.name,
    icon: def.icon,
    job: def.job,
    star: updated.star,
    level: updated.level,
    atk: stats.atk,
    def: stats.def,
    hp: stats.hp,
    spd: stats.spd,
    power: heroPower(stats.atk, stats.def, stats.hp),
    equipment: updated.equipments.map(equipDto),
  };
}

export async function getDungeons(player: Player): Promise<DungeonDto[]> {
  const { heroes } = await getHeroes(player);
  const powers = heroes.map((h) => h.power).sort((a, b) => b - a);
  const teamPower = powers.slice(0, 3).reduce((s, p) => s + p, 0);

  return DUNGEONS.map((d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    unlockLevel: d.unlockLevel,
    unlocked: player.level >= d.unlockLevel,
    recommendedPower: d.recommendedPower,
    energyCost: d.energyCost,
    expReward: d.expReward,
    stonesReward: d.stonesReward,
    teamPower,
  }));
}

/** 副本自动战斗（服务端结算，数值设计 §9） */
export async function battle(
  player: Player,
  dungeonId: string,
  heroIds: string[],
  force: "win" | "lose" | undefined = undefined,
): Promise<BattleResultDto> {
  const dungeon = getDungeon(dungeonId);
  if (!dungeon) throw httpError(404, "副本不存在");
  if (player.level < dungeon.unlockLevel) throw httpError(400, `需要 ${dungeon.unlockLevel} 级（${dungeon.unlockLevel <= 20 ? "筑基" : "更高境界"}）才能挑战此副本`);
  if (heroIds.length < 1 || heroIds.length > 3) throw httpError(400, "请选择 1~3 名冒险者");

  const p = await regenEnergy(player);
  if (p.energy < dungeon.energyCost) throw httpError(400, `体力不足（需要 ${dungeon.energyCost} 点）`);

  const heroes = await prisma.hero.findMany({
    where: { id: { in: heroIds }, playerId: player.id },
    include: { equipments: true },
  });
  if (heroes.length !== heroIds.length) throw httpError(400, "队伍中有不属于你的冒险者");

  // 队伍总属性
  let teamAtk = 0;
  let teamDef = 0;
  let teamHp = 0;
  for (const h of heroes) {
    const s = heroStats(h, h.equipments);
    teamAtk += s.atk;
    teamDef += s.def;
    teamHp += s.hp;
  }

  // 怪物属性（按推荐战力反推）
  const monsterAtk = Math.round(dungeon.recommendedPower * 0.33);
  const monsterDef = Math.round(dungeon.recommendedPower * 0.1);
  let monsterHp = dungeon.recommendedPower * 2.2;
  let currentTeamHp = teamHp;

  const log: string[] = [];
  log.push(`⚔️ 挑战【${dungeon.name}】！我方战力 ${heroPower(teamAtk, teamDef, teamHp)}（推荐 ${dungeon.recommendedPower}）`);
  log.push(`我方：攻${teamAtk} 防${teamDef} 血${teamHp}；怪物：攻${monsterAtk} 血${Math.round(monsterHp)}`);

  let success = false;
  const maxRounds = 20;
  for (let round = 1; round <= maxRounds; round++) {
    const dmgToMonster = Math.max(1, Math.round(teamAtk * (0.9 + Math.random() * 0.2) - monsterDef * 0.2));
    monsterHp -= dmgToMonster;
    log.push(`第${round}回合：我方造成 ${dmgToMonster} 伤害，怪物剩余 ${Math.max(0, Math.round(monsterHp))} 血`);
    if (monsterHp <= 0) {
      success = true;
      log.push(`💥 ${dungeon.name} 的怪物被击溃，通关！`);
      break;
    }
    const dmgToTeam = Math.max(1, Math.round(monsterAtk * (0.9 + Math.random() * 0.2) - teamDef * 0.15));
    currentTeamHp -= dmgToTeam;
    log.push(`第${round}回合：怪物反击 ${dmgToTeam} 伤害，我方剩余 ${Math.max(0, Math.round(currentTeamHp))} 血`);
    if (currentTeamHp <= 0) {
      log.push("😵 队伍全军覆没……");
      break;
    }
  }
  if (force === "win") {
    success = true;
    log.push("（测试模式：强制胜利）");
  }
  if (force === "lose") {
    success = false;
    log.push("（测试模式：强制失败）");
  }

  // 结算
  const expGained = success ? dungeon.expReward : Math.round(dungeon.expReward * 0.1);
  const stonesGained = success ? dungeon.stonesReward : 0;
  const loot: LootEntryDto[] = [];
  let equipmentDto: EquipmentDto | null = null;
  let fragment: LootEntryDto | null = null;

  await prisma.player.update({
    where: { id: player.id },
    data: {
      energy: { decrement: dungeon.energyCost },
      energyUpdatedAt: new Date(),
      stones: { increment: stonesGained },
    },
  });

  if (success) {
    // 材料掉落（1 roll）
    const mat = rollWeighted(dungeon.materialPool);
    const matItem = await prisma.itemDef.findUnique({ where: { id: mat.itemId } });
    await prisma.playerInventory.upsert({
      where: { playerId_itemId: { playerId: player.id, itemId: mat.itemId } },
      create: { playerId: player.id, itemId: mat.itemId, quantity: mat.count },
      update: { quantity: { increment: mat.count } },
    });
    loot.push({ itemId: mat.itemId, name: matItem?.name ?? mat.itemId, icon: matItem?.icon ?? "📦", quantity: mat.count });

    // 装备掉落
    if (Math.random() < dungeon.equipChance) {
      const quality = rollWeighted(dungeon.equipQualityPool).quality;
      const slots: EquipmentSlot[] = ["weapon", "armor", "accessory"];
      const slot = slots[Math.floor(Math.random() * slots.length)];
      const stats = equipmentStats(slot, quality, 0);
      const eq = await prisma.equipment.create({
        data: {
          playerId: player.id,
          slot,
          quality,
          level: 0,
          atk: stats.atk,
          def: stats.def,
          hp: stats.hp,
        },
      });
      equipmentDto = equipDto(eq);
      log.push(`🎁 掉落装备：${EQUIPMENT_QUALITIES[quality].label}${EQUIPMENT_SLOTS[slot].label}！`);
    }

    // 稀有碎片
    if (Math.random() < dungeon.fragmentChance) {
      const fragItem = await prisma.itemDef.findUnique({ where: { id: dungeon.fragmentItemId } });
      await prisma.playerInventory.upsert({
        where: { playerId_itemId: { playerId: player.id, itemId: dungeon.fragmentItemId } },
        create: { playerId: player.id, itemId: dungeon.fragmentItemId, quantity: 1 },
        update: { quantity: { increment: 1 } },
      });
      fragment = {
        itemId: dungeon.fragmentItemId,
        name: fragItem?.name ?? dungeon.fragmentItemId,
        icon: fragItem?.icon ?? "💠",
        quantity: 1,
      };
      log.push(`✨ 掉落稀有物：${fragment.name}！`);
    }
  }

  const levelResult = await addExp(player, expGained);

  await prisma.battleLog.create({
    data: {
      playerId: player.id,
      dungeonId,
      success,
      rewards: { exp: expGained, stones: stonesGained, loot: loot.map((l) => l.itemId) } as unknown as object,
      logText: log as unknown as object,
    },
  });

  return {
    success,
    dungeonId,
    dungeonName: dungeon.name,
    log,
    expGained,
    stonesGained,
    levelUps: levelResult.levelUps,
    newLevel: levelResult.level,
    energyLeft: p.energy - dungeon.energyCost,
    loot,
    equipment: equipmentDto,
    fragment,
  };
}

export async function equipItem(player: Player, equipmentId: string, heroId: string): Promise<void> {
  const eq = await prisma.equipment.findFirst({ where: { id: equipmentId, playerId: player.id } });
  if (!eq) throw httpError(404, "装备不存在");
  const hero = await prisma.hero.findFirst({ where: { id: heroId, playerId: player.id } });
  if (!hero) throw httpError(404, "冒险者不存在");

  // 同部位：卸下该英雄已有装备
  await prisma.equipment.updateMany({
    where: { heroId: hero.id, slot: eq.slot },
    data: { heroId: null },
  });
  await prisma.equipment.update({ where: { id: eq.id }, data: { heroId: hero.id } });
}

export async function unequipItem(player: Player, equipmentId: string): Promise<void> {
  const eq = await prisma.equipment.findFirst({ where: { id: equipmentId, playerId: player.id } });
  if (!eq) throw httpError(404, "装备不存在");
  await prisma.equipment.update({ where: { id: eq.id }, data: { heroId: null } });
}
