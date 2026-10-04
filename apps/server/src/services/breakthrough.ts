import { prisma, type Player } from "@tavern/database";
import {
  BREAKTHROUGHS,
  BREAKTHROUGH_COMPENSATION_CAP,
  BREAKTHROUGH_COMPENSATION_PER_FAIL,
  MAX_PLAYER_LEVEL,
  expToNext,
  getCrop,
  isRealmCapLevel,
  realmOfLevel,
  type BreakthroughInfoDto,
  type BreakthroughResultDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";
import { bus, BUS_EVENTS, type BreakthroughAnnounce } from "../bus.js";

/** 突破信息：是否可突破、需求、成功率（含连续失败补偿） */
export async function breakthroughInfo(player: Player): Promise<BreakthroughInfoDto> {
  if (player.level >= MAX_PLAYER_LEVEL) {
    return {
      available: false,
      maxedOut: true,
      currentRealm: player.realm,
      targetRealm: player.realm,
      stonesCost: 0,
      stonesHave: player.stones,
      materials: [],
      baseSuccess: 0,
      compensation: 0,
      successRate: 0,
      fails: player.breakthroughFails,
      cooldownUntil: null,
    };
  }

  const req = BREAKTHROUGHS[player.level];
  if (!req || !isRealmCapLevel(player.level)) {
    return {
      available: false,
      maxedOut: false,
      currentRealm: realmOfLevel(player.level),
      targetRealm: realmOfLevel(player.level + 1),
      stonesCost: 0,
      stonesHave: player.stones,
      materials: [],
      baseSuccess: 0,
      compensation: 0,
      successRate: 0,
      fails: player.breakthroughFails,
      cooldownUntil: player.breakthroughCooldownUntil?.toISOString() ?? null,
    };
  }

  const materials = [];
  for (const m of req.materials) {
    const row = await prisma.playerInventory.findUnique({
      where: { playerId_itemId: { playerId: player.id, itemId: m.itemId } },
      include: { item: true },
    });
    const crop = getCrop(m.itemId);
    materials.push({
      itemId: m.itemId,
      name: row?.item.name ?? crop?.name ?? m.itemId,
      icon: row?.item.icon ?? crop?.icon ?? "📦",
      need: m.count,
      have: row?.quantity ?? 0,
    });
  }

  const compensation = Math.min(player.breakthroughFails * BREAKTHROUGH_COMPENSATION_PER_FAIL, BREAKTHROUGH_COMPENSATION_CAP);
  // 必成突破（筑基教学关）不吃 95% 上限；其余境界上限 95%
  const successRate =
    req.baseSuccess >= 1 ? 1 : Math.min(req.baseSuccess + compensation, 0.95);

  return {
    available: true,
    maxedOut: false,
    currentRealm: player.realm,
    targetRealm: req.realm,
    stonesCost: req.stonesCost,
    stonesHave: player.stones,
    materials,
    baseSuccess: req.baseSuccess,
    compensation,
    successRate,
    fails: player.breakthroughFails,
    cooldownUntil: player.breakthroughCooldownUntil?.toISOString() ?? null,
  };
}

/** 渡劫突破：扣费 → 掷骰 → 结算（成功升级/失败惩罚+冷却） */
export async function attemptBreakthrough(player: Player): Promise<BreakthroughResultDto> {
  const info = await breakthroughInfo(player);
  if (!info.available) throw httpError(400, "修为未满或已至飞升上限");
  if (info.cooldownUntil && new Date(info.cooldownUntil).getTime() > Date.now()) {
    throw httpError(400, `渡劫失败后需静养，冷却至 ${info.cooldownUntil.slice(0, 16).replace("T", " ")}`);
  }

  const req = BREAKTHROUGHS[player.level];
  if (!req) throw httpError(400, "无此突破");
  if (player.stones < req.stonesCost) throw httpError(400, `突破需要 ${req.stonesCost} 灵石`);

  // 校验并扣除材料
  const materialNames: string[] = [];
  for (const m of req.materials) {
    const crop = getCrop(m.itemId);
    const row = await prisma.playerInventory.findUnique({
      where: { playerId_itemId: { playerId: player.id, itemId: m.itemId } },
    });
    if (!row || row.quantity < m.count) {
      throw httpError(400, `缺少突破材料 ${crop?.name ?? m.itemId} ×${m.count}`);
    }
    materialNames.push(`${crop?.name ?? m.itemId}×${m.count}`);
  }

  const successRate = info.successRate;
  const success = Math.random() < successRate;
  const now = new Date();
  const costSnapshot = { stones: req.stonesCost, materials: req.materials };

  if (success) {
    const newLevel = player.level + 1;
    await prisma.$transaction([
      prisma.player.update({
        where: { id: player.id },
        data: {
          stones: { decrement: req.stonesCost },
          level: newLevel,
          exp: 0,
          realm: req.realm,
          breakthroughFails: 0,
          breakthroughCooldownUntil: null,
        },
      }),
      ...req.materials.map((m) =>
        prisma.playerInventory.update({
          where: { playerId_itemId: { playerId: player.id, itemId: m.itemId } },
          data: { quantity: { decrement: m.count } },
        }),
      ),
      prisma.breakthroughLog.create({
        data: {
          playerId: player.id,
          fromRealm: player.realm,
          toRealm: req.realm,
          success: true,
          cost: costSnapshot as object,
        },
      }),
    ]);

    const announce: BreakthroughAnnounce = {
      playerId: player.id,
      nickname: player.nickname,
      realm: req.realm,
    };
    bus.emit(BUS_EVENTS.BREAKTHROUGH, announce);

    return {
      success: true,
      fromRealm: player.realm,
      toRealm: req.realm,
      expLost: 0,
      stonesSpent: req.stonesCost,
      cooldownUntil: null,
      message: `天雷淬体，道基重塑！你成功突破至【${req.realm}】境界！${materialNames.length ? `（消耗 ${materialNames.join("、")}）` : ""}`,
    };
  }

  // 失败：修为 -20%（不低于 0），材料灵石全耗，冷却 24h
  const expLost = Math.floor(expToNext(player.level) * 0.2);
  const cooldownUntil = new Date(now.getTime() + req.cooldownHours * 3_600_000);

  await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: {
        stones: { decrement: req.stonesCost },
        exp: Math.max(0, player.exp - expLost),
        breakthroughFails: { increment: 1 },
        breakthroughCooldownUntil: cooldownUntil,
      },
    }),
    ...req.materials.map((m) =>
      prisma.playerInventory.update({
        where: { playerId_itemId: { playerId: player.id, itemId: m.itemId } },
        data: { quantity: { decrement: m.count } },
      }),
    ),
    prisma.breakthroughLog.create({
      data: {
        playerId: player.id,
        fromRealm: player.realm,
        toRealm: null,
        success: false,
        cost: costSnapshot as object,
      },
    }),
  ]);

  return {
    success: false,
    fromRealm: player.realm,
    toRealm: null,
    expLost,
    stonesSpent: req.stonesCost,
    cooldownUntil: cooldownUntil.toISOString(),
    message: `渡劫失败！雷劫反噬，修为 -${expLost}，材料尽毁。需静养 ${req.cooldownHours} 小时再试（连续失败会提高下次成功率）。`,
  };
}
