import { prisma, type Player } from "@tavern/database";
import {
  CROPS,
  FAME_AVG_SPEND,
  FAME_CUSTOMERS_PER_HOUR,
  FAME_THRESHOLDS,
  NPC_NAMES,
  TAVERN_MAX_PENDING_ORDERS,
  TAVERN_ORDER_TTL_MINUTES,
  cropCanPlantInSeason,
  currentSeason,
  customerOrderQuantity,
  fameLevelOf,
  getCrop,
  type ServeResultDto,
  type TavernDto,
  type TavernOrderDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";
import { addExp } from "./leveling.js";

/** 顾客到店：按离线时长批量生成订单（阶段4 简化：每小时客流，最多挂 12 单） */
export async function getTavern(player: Player): Promise<TavernDto> {
  const now = new Date();

  // 过期订单清理
  await prisma.tavernOrder.updateMany({
    where: { playerId: player.id, status: "pending", expiresAt: { lte: now } },
    data: { status: "expired" },
  });

  const level = fameLevelOf(player.totalRevenue);
  const customersPerHour = FAME_CUSTOMERS_PER_HOUR[level];
  const avgSpend = FAME_AVG_SPEND[level];

  const pendingCount = await prisma.tavernOrder.count({
    where: { playerId: player.id, status: "pending" },
  });

  let genAt = player.lastCustomerGenAt ?? now;
  const elapsedHours = Math.max(0, (now.getTime() - genAt.getTime()) / 3_600_000);
  const want = Math.floor(elapsedHours * customersPerHour);
  const newCount = Math.min(want, TAVERN_MAX_PENDING_ORDERS - pendingCount);

  if (newCount > 0) {
    // 已解锁且当季可种的作物为点单池
    const season = currentSeason();
    const pool = CROPS.filter(
      (c) => player.level >= c.unlockLevel && cropCanPlantInSeason(c, season),
    );
    const orderCreate: Array<{
      customerName: string;
      itemId: string;
      quantity: number;
      price: number;
      expiresAt: Date;
    }> = [];
    for (let i = 0; i < newCount; i++) {
      const crop = pool[Math.floor(Math.random() * pool.length)];
      const quantity = customerOrderQuantity(avgSpend, crop.sellPrice);
      orderCreate.push({
        customerName: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)],
        itemId: crop.id,
        quantity,
        price: crop.sellPrice * quantity,
        expiresAt: new Date(now.getTime() + TAVERN_ORDER_TTL_MINUTES * 60_000),
      });
    }
    await prisma.tavernOrder.createMany({
      data: orderCreate.map((o) => ({ playerId: player.id, ...o })),
    });
  }

  // 时间推进：只消耗生成订单所对应的时长（剩余小数小时累计到下次）
  const consumedHours = newCount / (customersPerHour || 1);
  const nextGenAt = new Date(genAt.getTime() + consumedHours * 3_600_000);
  if (nextGenAt.getTime() > genAt.getTime()) {
    await prisma.player.update({
      where: { id: player.id },
      data: { lastCustomerGenAt: nextGenAt },
    });
  }

  const orders = await prisma.tavernOrder.findMany({
    where: { playerId: player.id, status: "pending" },
    orderBy: { expiresAt: "asc" },
  });
  const invRows = await prisma.playerInventory.findMany({ where: { playerId: player.id } });
  const invMap = new Map(invRows.map((r) => [r.itemId, r.quantity]));

  const orderDtos: TavernOrderDto[] = orders.map((o) => {
    const crop = getCrop(o.itemId);
    return {
      id: o.id,
      customerName: o.customerName,
      itemId: o.itemId,
      itemName: crop?.name ?? o.itemId,
      itemIcon: crop?.icon ?? "🍽️",
      quantity: o.quantity,
      price: o.price,
      have: invMap.get(o.itemId) ?? 0,
      expiresAt: o.expiresAt.toISOString(),
    };
  });

  const levelThresholds = [...FAME_THRESHOLDS];
  return {
    fameLevel: level,
    customersPerHour,
    avgSpend,
    totalRevenue: player.totalRevenue,
    revenueToNext: levelThresholds[level] ?? null,
    orders: orderDtos,
  };
}

/** 招待顾客：消耗背包食材，收灵石，涨营业额（口碑） */
export async function serveOrder(player: Player, orderId: string): Promise<ServeResultDto> {
  const order = await prisma.tavernOrder.findFirst({
    where: { id: orderId, playerId: player.id, status: "pending" },
  });
  if (!order) throw httpError(404, "订单不存在或已处理");
  if (order.expiresAt.getTime() <= Date.now()) {
    await prisma.tavernOrder.update({ where: { id: order.id }, data: { status: "expired" } });
    throw httpError(400, "这位客人等不及，已经走了");
  }

  const inv = await prisma.playerInventory.findUnique({
    where: { playerId_itemId: { playerId: player.id, itemId: order.itemId } },
  });
  if (!inv || inv.quantity < order.quantity) {
    const crop = getCrop(order.itemId);
    throw httpError(400, `货不够：需要 ${crop?.name ?? order.itemId} ×${order.quantity}`);
  }

  const [updated] = await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: {
        stones: { increment: order.price },
        totalRevenue: { increment: order.price },
      },
    }),
    prisma.playerInventory.update({
      where: { id: inv.id },
      data: { quantity: { decrement: order.quantity } },
    }),
    prisma.tavernOrder.update({
      where: { id: order.id },
      data: { status: "served" },
    }),
  ]);

  // 出餐给少量修为（经营亦有道）
  const levelResult = await addExp(player, Math.max(1, Math.round(order.price / 10)));

  const crop = getCrop(order.itemId);
  return {
    orderId: order.id,
    customerName: order.customerName,
    itemName: crop?.name ?? order.itemId,
    quantity: order.quantity,
    stonesGained: order.price,
    stonesNow: updated.stones,
    totalRevenue: updated.totalRevenue,
    fameLevel: fameLevelOf(updated.totalRevenue),
    levelUps: levelResult.levelUps,
  };
}
