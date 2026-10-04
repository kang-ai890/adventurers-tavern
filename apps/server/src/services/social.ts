import { prisma, type Player } from "@tavern/database";
import {
  FARM_BUILDING,
  WATERER_AFFINITY_GAIN,
  WATER_MAX_PER_PLOT_PER_DAY,
  WATER_SPEEDUP,
  WATERER_REWARD_STONES,
  currentSeason,
  fameLevelOf,
  getCrop,
  realmOfLevel,
  type FriendDto,
  type FriendsDto,
  type VisitDto,
  type WaterResultDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";

/** 通过道号或玩家 ID 找到玩家（返回 player + user） */
async function findPlayerByRef(ref: string) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(ref)) {
    const byId = await prisma.player.findUnique({ where: { id: ref }, include: { user: true } });
    if (byId) return byId;
    throw httpError(404, "没有找到这位修士");
  }
  const byName = await prisma.player.findMany({ where: { nickname: ref }, include: { user: true } });
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw httpError(400, "此道号有重名，请让对方提供完整玩家 ID");
  throw httpError(404, "没有找到这位修士");
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- 好友 ----------

export async function getFriends(player: Player): Promise<FriendsDto> {
  const userId = player.userId;
  const rows = await prisma.friend.findMany({
    where: {
      OR: [{ requesterId: userId }, { recipientId: userId }],
    },
  });
  const accepted = rows.filter((r) => r.status === "accepted");
  const pendingIn = rows.filter((r) => r.status === "pending" && r.recipientId === userId);
  const pendingOut = rows.filter((r) => r.status === "pending" && r.requesterId === userId);

  const peerUserIds = accepted.map((r) => (r.requesterId === userId ? r.recipientId : r.requesterId));
  const peers = await prisma.player.findMany({ where: { userId: { in: peerUserIds } } });
  const peerMap = new Map(peers.map((p) => [p.userId, p]));

  const friends: FriendDto[] = accepted.map((r) => {
    const peerId = r.requesterId === userId ? r.recipientId : r.requesterId;
    const peer = peerMap.get(peerId);
    return {
      friendId: r.id,
      playerId: peer?.id ?? "",
      nickname: peer?.nickname ?? "未知修士",
      realm: peer ? realmOfLevel(peer.level) : "-",
      level: peer?.level ?? 0,
      affinity: r.affinity,
    };
  });

  const mapPending = async (rows: typeof accepted, key: "requesterId" | "recipientId") => {
    const ids = rows.map((r) => r[key]);
    const players = await prisma.player.findMany({ where: { userId: { in: ids } } });
    const map = new Map(players.map((p) => [p.userId, p]));
    return rows.map((r) => ({
      friendId: r.id,
      playerId: map.get(r[key])?.id ?? "",
      nickname: map.get(r[key])?.nickname ?? "未知修士",
    }));
  };

  return {
    friends,
    pendingIn: await mapPending(pendingIn, "requesterId"),
    pendingOut: await mapPending(pendingOut, "recipientId"),
  };
}

export async function sendFriendRequest(player: Player, ref: string): Promise<{ friendId: string }> {
  const target = await findPlayerByRef(ref);
  if (target.userId === player.userId) throw httpError(400, "不能加自己为好友");
  const existing = await prisma.friend.findFirst({
    where: {
      OR: [
        { requesterId: player.userId, recipientId: target.userId },
        { requesterId: target.userId, recipientId: player.userId },
      ],
    },
  });
  if (existing) {
    if (existing.status === "accepted") throw httpError(400, "你们已经是好友了");
    if (existing.requesterId === player.userId) throw httpError(400, "申请已发出，等待对方回应");
    // 对方已向我发过申请 → 直接互相成为好友
    await prisma.friend.update({
      where: { id: existing.id },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    return { friendId: existing.id };
  }
  const created = await prisma.friend.create({
    data: { requesterId: player.userId, recipientId: target.userId },
  });
  return { friendId: created.id };
}

export async function acceptFriendRequest(player: Player, friendId: string): Promise<void> {
  const row = await prisma.friend.findFirst({
    where: { id: friendId, recipientId: player.userId, status: "pending" },
  });
  if (!row) throw httpError(404, "申请不存在");
  await prisma.friend.update({
    where: { id: row.id },
    data: { status: "accepted", acceptedAt: new Date() },
  });
}

export async function removeFriend(player: Player, friendId: string): Promise<void> {
  const row = await prisma.friend.findFirst({
    where: {
      id: friendId,
      OR: [{ requesterId: player.userId }, { recipientId: player.userId }],
    },
  });
  if (!row) throw httpError(404, "好友关系不存在");
  await prisma.friend.delete({ where: { id: row.id } });
}

// ---------- 拜访与浇水 ----------

async function assertFriends(userId: string, targetUserId: string): Promise<void> {
  const rel = await prisma.friend.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: userId, recipientId: targetUserId },
        { requesterId: targetUserId, recipientId: userId },
      ],
    },
  });
  if (!rel) throw httpError(403, "只有好友才能拜访领地");
}

export async function getVisitView(viewer: Player, targetPlayerId: string): Promise<VisitDto> {
  const target = await prisma.player.findUnique({ where: { id: targetPlayerId } });
  if (!target) throw httpError(404, "修士不存在");
  await assertFriends(viewer.userId, target.userId);

  const farmLevel = await getFarmLevel(target.id);
  const plotCount = FARM_BUILDING.plotsByLevel[farmLevel - 1];
  const plots = await prisma.farmPlot.findMany({
    where: { playerId: target.id, plotIndex: { lt: plotCount } },
    orderBy: { plotIndex: "asc" },
  });
  const plotMap = new Map(plots.map((p) => [p.plotIndex, p]));

  const plotDtos = [];
  for (let i = 0; i < plotCount; i++) {
    const p = plotMap.get(i);
    if (p?.cropId) {
      const crop = getCrop(p.cropId);
      plotDtos.push({
        plotIndex: i,
        cropId: p.cropId,
        cropName: crop?.name ?? p.cropId,
        cropIcon: crop?.icon ?? "🌱",
        readyAt: p.readyAt?.toISOString() ?? null,
        ready: p.readyAt !== null && p.readyAt.getTime() <= Date.now(),
        waterCountToday: p.waterDate === todayStr() ? p.waterCount : 0,
      });
    } else {
      plotDtos.push({
        plotIndex: i,
        cropId: null,
        cropName: null,
        cropIcon: null,
        readyAt: null,
        ready: false,
        waterCountToday: 0,
      });
    }
  }

  return {
    playerId: target.id,
    nickname: target.nickname,
    realm: realmOfLevel(target.level),
    level: target.level,
    fameLevel: fameLevelOf(target.totalRevenue),
    farmLevel,
    season: currentSeason(),
    plots: plotDtos,
  };
}

export async function waterPlot(waterer: Player, targetPlayerId: string, plotIndex: number): Promise<WaterResultDto> {
  const target = await prisma.player.findUnique({ where: { id: targetPlayerId } });
  if (!target) throw httpError(404, "修士不存在");
  await assertFriends(waterer.userId, target.userId);

  const plot = await prisma.farmPlot.findUnique({
    where: { playerId_plotIndex: { playerId: target.id, plotIndex } },
  });
  if (!plot?.cropId || !plot.readyAt) throw httpError(400, "这块地还没种东西");
  if (plot.readyAt.getTime() <= Date.now()) throw httpError(400, "作物已经成熟，不用浇了");

  const date = todayStr();
  const countToday = plot.waterDate === date ? plot.waterCount : 0;
  if (countToday >= WATER_MAX_PER_PLOT_PER_DAY) throw httpError(400, "这块地今天喝饱了（每块地每日 5 次）");

  const remaining = plot.readyAt.getTime() - Date.now();
  const newReadyAt = new Date(Date.now() + remaining * (1 - WATER_SPEEDUP));

  await prisma.$transaction([
    prisma.farmPlot.update({
      where: { id: plot.id },
      data: {
        readyAt: newReadyAt,
        waterCount: countToday + 1,
        waterDate: date,
        wateredBy: { push: waterer.id },
      },
    }),
    prisma.player.update({
      where: { id: waterer.id },
      data: { stones: { increment: WATERER_REWARD_STONES } },
    }),
    prisma.friend.updateMany({
      where: {
        status: "accepted",
        OR: [
          { requesterId: waterer.userId, recipientId: target.userId },
          { requesterId: target.userId, recipientId: waterer.userId },
        ],
      },
      data: { affinity: { increment: WATERER_AFFINITY_GAIN } },
    }),
  ]);

  return {
    plotIndex,
    speedupPercent: Math.round(WATER_SPEEDUP * 100),
    newReadyAt: newReadyAt.toISOString(),
    rewardStones: WATERER_REWARD_STONES,
    affinityGained: WATERER_AFFINITY_GAIN,
    waterCountToday: countToday + 1,
  };
}

async function getFarmLevel(playerId: string): Promise<number> {
  const b = await prisma.building.findUnique({
    where: { playerId_type: { playerId, type: "farm" } },
  });
  return b?.level ?? 1;
}
