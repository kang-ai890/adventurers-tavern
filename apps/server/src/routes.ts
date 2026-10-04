import { Router } from "express";
import { prisma } from "@tavern/database";
import {
  FARM_BUILDING,
  GuestLoginSchema,
  LoginSchema,
  PlantSchema,
  HarvestSchema,
  RegisterSchema,
  SellSchema,
  UpgradeBuildingSchema,
  cropCanPlantInSeason,
  currentSeason,
  getCrop,
  type BuildingDto,
  type FarmPlotDto,
  type FarmStateDto,
  type HarvestResultDto,
  type PlantResultDto,
  type SellResultDto,
  type UpgradeResultDto,
} from "@tavern/shared";
import {
  authRequired,
  getPlayerOrThrow,
  guestLogin,
  loginAccount,
  publicPlayer,
  registerAccount,
  type AuthedRequest,
} from "./auth.js";
import { addExp } from "./services/leveling.js";
import { attemptBreakthrough, breakthroughInfo } from "./services/breakthrough.js";
import { claimQuest, ensureDailyQuests, progressQuests, questDtos } from "./services/quests.js";
import { maybeTriggerEvent, resolveEvent } from "./services/events.js";
import { getTavern, serveOrder } from "./services/tavern.js";
import {
  acceptFriendRequest,
  getFriends,
  getVisitView,
  removeFriend,
  sendFriendRequest,
  waterPlot,
} from "./services/social.js";
import { bestLine, plazaStatus, refreshStallStock, socketIdsOfPlayer } from "./services/plaza.js";
import { attack, enterWild, gather, getWild, leaveWild } from "./services/wild.js";
import { checkin, getDaily, treasure } from "./services/daily.js";
import { env } from "./env.js";

export const apiRouter = Router();

/** 通用异步错误包装 */
function wrap(handler: (req: AuthedRequest, res: import("express").Response) => Promise<void>) {
  return (req: import("express").Request, res: import("express").Response) => {
    handler(req as AuthedRequest, res).catch((err: Error & { status?: number }) => {
      const status = err.status ?? 500;
      if (status >= 500) console.error("[api]", err);
      res.status(status).json({ error: err.message || "服务器错误" });
    });
  };
}

// ---------- 认证 ----------

apiRouter.post("/auth/guest", wrap(async (req, res) => {
  const body = GuestLoginSchema.parse(req.body);
  const result = await guestLogin(body.deviceToken, body.nickname);
  res.json(result);
}));

apiRouter.post("/auth/register", wrap(async (req, res) => {
  const body = RegisterSchema.parse(req.body);
  const result = await registerAccount(body);
  res.json(result);
}));

apiRouter.post("/auth/login", wrap(async (req, res) => {
  const body = LoginSchema.parse(req.body);
  const result = await loginAccount(body.username, body.password);
  res.json(result);
}));

// ---------- 玩家 ----------

apiRouter.get("/player", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(publicPlayer(player));
}));

// ---------- 领地（灵田 / 建筑 / 背包） ----------

apiRouter.get("/farm", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  const farmLevel = await getFarmLevel(player.id);
  const plotCount = FARM_BUILDING.plotsByLevel[farmLevel - 1];

  const plots = await prisma.farmPlot.findMany({
    where: { playerId: player.id, plotIndex: { lt: plotCount } },
    orderBy: { plotIndex: "asc" },
  });
  const plotMap = new Map(plots.map((p) => [p.plotIndex, p]));

  const plotDtos: FarmPlotDto[] = [];
  for (let i = 0; i < plotCount; i++) {
    const p = plotMap.get(i);
    if (p?.cropId) {
      const crop = getCrop(p.cropId);
      const ready = p.readyAt !== null && p.readyAt.getTime() <= Date.now();
      plotDtos.push({
        plotIndex: i,
        cropId: p.cropId,
        cropName: crop?.name ?? p.cropId,
        cropIcon: crop?.icon ?? "🌱",
        plantedAt: p.plantedAt?.toISOString() ?? null,
        readyAt: p.readyAt?.toISOString() ?? null,
        ready,
      });
    } else {
      plotDtos.push({ plotIndex: i, cropId: null, cropName: null, cropIcon: null, plantedAt: null, readyAt: null, ready: false });
    }
  }

  const inventoryRows = await prisma.playerInventory.findMany({
    where: { playerId: player.id, quantity: { gt: 0 } },
    include: { item: true },
  });
  const inventory = inventoryRows.map((r) => ({
    itemId: r.itemId,
    name: r.item.name,
    icon: r.item.icon,
    price: r.item.basePrice,
    quantity: r.quantity,
  }));

  const buildings: BuildingDto[] = [farmBuildingDto(farmLevel, player.level)];

  const state: FarmStateDto = {
    season: currentSeason(),
    farmLevel,
    plotCount,
    plots: plotDtos,
    buildings,
    inventory,
  };
  res.json(state);
}));

apiRouter.post("/farm/plant", authRequired, wrap(async (req, res) => {
  const body = PlantSchema.parse(req.body);
  const player = await getPlayerOrThrow(req.userId);  const crop = getCrop(body.cropId);
  if (!crop) {
    res.status(404).json({ error: "没有这种作物" });
    return;
  }
  const farmLevel = await getFarmLevel(player.id);
  const plotCount = FARM_BUILDING.plotsByLevel[farmLevel - 1];
  if (body.plotIndex < 0 || body.plotIndex >= plotCount) {
    res.status(400).json({ error: "这块灵田还没开垦" });
    return;
  }
  if (player.level < crop.unlockLevel) {
    res.status(400).json({ error: `需要 ${crop.unlockLevel} 级才能种植${crop.name}` });
    return;
  }
  if (!cropCanPlantInSeason(crop, currentSeason())) {
    res.status(400).json({ error: `${crop.name}不适合在${currentSeason()}天种植` });
    return;
  }
  if (player.stones < crop.seedCost) {
    res.status(400).json({ error: "灵石不足，先去卖点收成吧" });
    return;
  }

  const existing = await prisma.farmPlot.findUnique({
    where: { playerId_plotIndex: { playerId: player.id, plotIndex: body.plotIndex } },
  });
  if (existing?.cropId) {
    res.status(409).json({ error: "这块地已经种上了" });
    return;
  }

  const now = new Date();
  const readyAt = new Date(now.getTime() + crop.growMinutes * 60_000);
  const [updated] = await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: { stones: { decrement: crop.seedCost } },
    }),
    prisma.farmPlot.upsert({
      where: { playerId_plotIndex: { playerId: player.id, plotIndex: body.plotIndex } },
      create: { playerId: player.id, plotIndex: body.plotIndex, cropId: crop.id, plantedAt: now, readyAt },
      update: { cropId: crop.id, plantedAt: now, readyAt, wateredBy: [] },
    }),
  ]);

  const result: PlantResultDto = {
    plotIndex: body.plotIndex,
    cropId: crop.id,
    cropName: crop.name,
    seedCost: crop.seedCost,
    stonesLeft: updated.stones,
    readyAt: readyAt.toISOString(),
  };
  await progressQuests(player.id, "plant", 1);
  res.json(result);
}));

apiRouter.post("/farm/harvest", authRequired, wrap(async (req, res) => {
  const body = HarvestSchema.parse(req.body);
  const player = await getPlayerOrThrow(req.userId);

  const plot = await prisma.farmPlot.findUnique({
    where: { playerId_plotIndex: { playerId: player.id, plotIndex: body.plotIndex } },
  });
  if (!plot?.cropId || !plot.readyAt) {
    res.status(400).json({ error: "这块地还没种东西" });
    return;
  }
  if (plot.readyAt.getTime() > Date.now()) {
    res.status(400).json({ error: "还没成熟，别拔苗助长" });
    return;
  }
  const crop = getCrop(plot.cropId);
  if (!crop) {
    res.status(500).json({ error: "作物定义缺失" });
    return;
  }

  // 结算：入背包 + 加经验（境界满级封顶）+ 清地块
  await prisma.$transaction([
    prisma.farmPlot.update({
      where: { id: plot.id },
      data: { cropId: null, plantedAt: null, readyAt: null, wateredBy: [] },
    }),
    prisma.playerInventory.upsert({
      where: { playerId_itemId: { playerId: player.id, itemId: crop.id } },
      create: { playerId: player.id, itemId: crop.id, quantity: crop.yieldCount },
      update: { quantity: { increment: crop.yieldCount } },
    }),
  ]);

  const levelResult = await addExp(player, crop.exp);
  // 任务进度 + 奇遇判定（forceEvent 仅开发环境，用于 E2E 确定性测试）
  await progressQuests(player.id, "harvest", 1);
  const force = (req.body as { forceEvent?: boolean }).forceEvent === true && env.NODE_ENV === "development";
  const pendingEvent = maybeTriggerEvent(player.id, force);
  // 摊位库存同步（收获入包后）
  for (const sid of socketIdsOfPlayer(player.id)) void refreshStallStock(sid);

  const result: HarvestResultDto = {
    cropId: crop.id,
    cropName: crop.name,
    quantity: crop.yieldCount,
    expGained: crop.exp,
    levelUps: levelResult.levelUps,
    newLevel: levelResult.level,
    newRealm: levelResult.realm,
    pendingEvent: pendingEvent ?? undefined,
  };
  res.json(result);
}));

// ---------- 售卖 ----------

apiRouter.post("/shop/sell", authRequired, wrap(async (req, res) => {
  const body = SellSchema.parse(req.body);
  const player = await getPlayerOrThrow(req.userId);

  const row = await prisma.playerInventory.findUnique({
    where: { playerId_itemId: { playerId: player.id, itemId: body.itemId } },
    include: { item: true },
  });
  if (!row || row.quantity < body.quantity) {
    res.status(400).json({ error: "背包里没这么多货" });
    return;
  }

  const gain = row.item.basePrice * body.quantity;
  const [updated] = await prisma.$transaction([
    prisma.player.update({ where: { id: player.id }, data: { stones: { increment: gain } } }),
    prisma.playerInventory.update({
      where: { id: row.id },
      data: { quantity: { decrement: body.quantity } },
    }),
  ]);

  const result: SellResultDto = {
    itemId: body.itemId,
    quantity: body.quantity,
    stonesGained: gain,
    stonesLeft: updated.stones,
  };
  await progressQuests(player.id, "sell", body.quantity);
  // 摊位库存同步（出售减包后）
  for (const sid of socketIdsOfPlayer(player.id)) void refreshStallStock(sid);
  res.json(result);
}));

// ---------- 建筑升级 ----------

apiRouter.post("/building/upgrade", authRequired, wrap(async (req, res) => {
  const body = UpgradeBuildingSchema.parse(req.body);
  const player = await getPlayerOrThrow(req.userId);
  if (body.type !== "farm") {
    res.status(400).json({ error: "未知建筑类型" });
    return;
  }

  const level = await getFarmLevel(player.id);
  if (level >= FARM_BUILDING.maxLevel) {
    res.status(400).json({ error: "灵田已是最高等级" });
    return;
  }
  const cost = FARM_BUILDING.upgradeCosts[level]; // 从 level 升到 level+1 的费用
  const unlockLevel = FARM_BUILDING.unlockLevels[level]; // 目标等级所需角色等级
  if (player.level < unlockLevel) {
    res.status(400).json({ error: `需要角色 ${unlockLevel} 级才能扩建` });
    return;
  }
  if (player.stones < cost) {
    res.status(400).json({ error: `扩建需要 ${cost} 灵石` });
    return;
  }

  const [updated] = await prisma.$transaction([
    prisma.player.update({ where: { id: player.id }, data: { stones: { decrement: cost } } }),
    prisma.building.upsert({
      where: { playerId_type: { playerId: player.id, type: "farm" } },
      create: { playerId: player.id, type: "farm", level: level + 1, x: 0, y: 0 },
      update: { level: level + 1 },
    }),
  ]);

  const result: UpgradeResultDto = {
    type: "farm",
    newLevel: level + 1,
    cost,
    stonesLeft: updated.stones,
    newPlotCount: FARM_BUILDING.plotsByLevel[level],
  };
  res.json(result);
}));

// ---------- 境界突破 ----------

apiRouter.get("/breakthrough", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await breakthroughInfo(player));
}));

apiRouter.post("/breakthrough", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await attemptBreakthrough(player));
}));

// ---------- 委托任务 ----------

apiRouter.get("/quests", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  const quests = await ensureDailyQuests(player);
  res.json(await questDtos(quests));
}));

apiRouter.post("/quests/:id/claim", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await claimQuest(player, req.params.id));
}));

// ---------- 奇遇事件 ----------

apiRouter.post("/event/resolve", authRequired, wrap(async (req, res) => {
  const body = req.body as { eventId?: string; option?: "A" | "B" };
  if (!body.eventId || (body.option !== "A" && body.option !== "B")) {
    res.status(400).json({ error: "参数错误" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  res.json(await resolveEvent(player, body.eventId, body.option));
}));

// ---------- 酒馆顾客 ----------

apiRouter.get("/tavern", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await getTavern(player));
}));

apiRouter.post("/tavern/serve", authRequired, wrap(async (req, res) => {
  const body = req.body as { orderId?: string };
  if (!body.orderId) {
    res.status(400).json({ error: "参数错误" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  res.json(await serveOrder(player, body.orderId));
}));

// ---------- 好友 ----------

apiRouter.get("/friends", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await getFriends(player));
}));

apiRouter.post("/friends/request", authRequired, wrap(async (req, res) => {
  const body = req.body as { ref?: string };
  const ref = body.ref?.trim();
  if (!ref) {
    res.status(400).json({ error: "请填写道号或玩家 ID" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  res.json(await sendFriendRequest(player, ref));
}));

apiRouter.post("/friends/accept", authRequired, wrap(async (req, res) => {
  const body = req.body as { friendId?: string };
  if (!body.friendId) {
    res.status(400).json({ error: "参数错误" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  await acceptFriendRequest(player, body.friendId);
  res.json({ ok: true });
}));

apiRouter.post("/friends/remove", authRequired, wrap(async (req, res) => {
  const body = req.body as { friendId?: string };
  if (!body.friendId) {
    res.status(400).json({ error: "参数错误" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  await removeFriend(player, body.friendId);
  res.json({ ok: true });
}));

// ---------- 拜访与浇水 ----------

apiRouter.get("/visit/:playerId", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await getVisitView(player, req.params.playerId));
}));

apiRouter.post("/visit/:playerId/water", authRequired, wrap(async (req, res) => {
  const body = req.body as { plotIndex?: number };
  if (typeof body.plotIndex !== "number") {
    res.status(400).json({ error: "参数错误" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  res.json(await waterPlot(player, req.params.playerId, body.plotIndex));
}));

// ---------- 广场 ----------

apiRouter.get("/plaza", (_req, res) => {
  res.json({ ...plazaStatus(), bestLine: bestLine() });
});

// ---------- 野外（采集 / PK / 悬赏） ----------

apiRouter.get("/wild", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await getWild(player));
}));

apiRouter.post("/wild/enter", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  if (player.level < 11) {
    res.status(400).json({ error: "筑基之后才能进入野外（11 级）" });
    return;
  }
  enterWild(player);
  res.json({ ok: true });
}));

apiRouter.post("/wild/leave", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  leaveWild(player);
  res.json({ ok: true });
}));

apiRouter.post("/wild/gather", authRequired, wrap(async (req, res) => {
  const body = req.body as { spotType?: "fish" | "mine" | "herb" };
  if (body.spotType !== "fish" && body.spotType !== "mine" && body.spotType !== "herb") {
    res.status(400).json({ error: "采集点类型错误" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  res.json(await gather(player, body.spotType));
}));

apiRouter.get("/bounty", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  const wild = await getWild(player);
  res.json({ bounty: wild.bounty });
}));

apiRouter.post("/wild/attack", authRequired, wrap(async (req, res) => {
  const body = req.body as { targetPlayerId?: string; forceWin?: boolean; forceLose?: boolean };
  if (!body.targetPlayerId) {
    res.status(400).json({ error: "请指定目标" });
    return;
  }
  const player = await getPlayerOrThrow(req.userId);
  const dev = env.NODE_ENV === "development";
  const force = dev && body.forceWin ? "win" : dev && body.forceLose ? "lose" : undefined;
  res.json(await attack(player, body.targetPlayerId, force));
}));

// ---------- 每日签到与寻宝 ----------

apiRouter.get("/daily", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await getDaily(player));
}));

apiRouter.post("/checkin", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await checkin(player));
}));

apiRouter.post("/treasure", authRequired, wrap(async (req, res) => {
  const player = await getPlayerOrThrow(req.userId);
  res.json(await treasure(player));
}));

// ---------- 工具函数 ----------

async function getFarmLevel(playerId: string): Promise<number> {
  const b = await prisma.building.findUnique({
    where: { playerId_type: { playerId, type: "farm" } },
  });
  return b?.level ?? 1;
}

function farmBuildingDto(level: number, playerLevel: number): BuildingDto {
  const isMax = level >= FARM_BUILDING.maxLevel;
  return {
    type: "farm",
    name: "灵田",
    level,
    maxLevel: FARM_BUILDING.maxLevel,
    upgradeCost: isMax ? null : FARM_BUILDING.upgradeCosts[level],
    upgradeUnlockLevel: isMax ? null : FARM_BUILDING.unlockLevels[level],
    effect: `地块 ${FARM_BUILDING.plotsByLevel[level - 1]} → ${isMax ? "-" : FARM_BUILDING.plotsByLevel[level]} 块${playerLevel < (FARM_BUILDING.unlockLevels[level] ?? 0) && !isMax ? "（等级不足）" : ""}`,
  };
}
