import { prisma, type Player } from "@tavern/database";
import {
  CHECKIN_CYCLE,
  CROPS,
  GATHER_TABLES,
  TREASURE_DAILY_LIMIT,
  TREASURE_POOL,
  type CheckinResultDto,
  type DailyDto,
  type TreasureResultDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";

/** 本地日期 YYYY-MM-DD */
function dateStr(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadDates(playerId: string): Promise<Set<string>> {
  const logs = await prisma.checkinLog.findMany({
    where: { playerId },
    select: { date: true },
    orderBy: { date: "desc" },
    take: 40,
  });
  return new Set(logs.map((l) => l.date));
}

/** 连续签到天数（含今日，若今日已签） */
async function calcStreak(playerId: string, checkedToday: boolean): Promise<number> {
  const dates = await loadDates(playerId);
  let streak = checkedToday ? 1 : 0;
  let day = 1;
  while (streak < 40) {
    if (dates.has(dateStr(-day))) {
      streak++;
      day++;
    } else {
      break;
    }
  }
  return streak;
}

export async function getDaily(player: Player): Promise<DailyDto> {
  const today = dateStr();
  const todayLog = await prisma.checkinLog.findUnique({
    where: { playerId_date: { playerId: player.id, date: today } },
  });
  const checkedToday = !!todayLog;
  const streak = await calcStreak(player.id, checkedToday);

  // 下一次签到是轮次第几天（已签则看明天）
  const nextIndex = streak % CHECKIN_CYCLE.length; // 0-based
  const next = CHECKIN_CYCLE[nextIndex];

  const treasureCount = await prisma.treasureLog.count({
    where: { playerId: player.id, date: today },
  });

  return {
    checkedInToday: checkedToday,
    streak,
    dayOfCycle: ((streak - 1 + CHECKIN_CYCLE.length) % CHECKIN_CYCLE.length) + 1,
    nextReward: { day: next.day, stones: next.stones, jades: next.jades },
    treasureLeft: Math.max(0, TREASURE_DAILY_LIMIT - treasureCount),
  };
}

export async function checkin(player: Player): Promise<CheckinResultDto> {
  const today = dateStr();
  const existing = await prisma.checkinLog.findUnique({
    where: { playerId_date: { playerId: player.id, date: today } },
  });
  if (existing) throw httpError(400, "今天已经签到过啦，明日再来");

  const streakBefore = await calcStreak(player.id, false); // 截至昨天的连续天数
  const rewardIndex = streakBefore % CHECKIN_CYCLE.length;
  const reward = CHECKIN_CYCLE[rewardIndex];

  await prisma.$transaction([
    prisma.checkinLog.create({
      data: {
        playerId: player.id,
        date: today,
        rewardStones: reward.stones,
        rewardJades: reward.jades,
      },
    }),
    prisma.player.update({
      where: { id: player.id },
      data: {
        stones: { increment: reward.stones },
        jades: { increment: reward.jades },
      },
    }),
  ]);

  return {
    day: reward.day,
    streak: streakBefore + 1,
    rewardStones: reward.stones,
    rewardJades: reward.jades,
  };
}

export async function treasure(player: Player): Promise<TreasureResultDto> {
  const today = dateStr();
  const count = await prisma.treasureLog.count({
    where: { playerId: player.id, date: today },
  });
  if (count >= TREASURE_DAILY_LIMIT) {
    throw httpError(400, `今日寻宝次数已用完（每日 ${TREASURE_DAILY_LIMIT} 次）`);
  }

  const total = TREASURE_POOL.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  let kind = TREASURE_POOL[TREASURE_POOL.length - 1];
  for (const t of TREASURE_POOL) {
    roll -= t.weight;
    if (roll <= 0) {
      kind = t;
      break;
    }
  }

  let result: TreasureResultDto;
  if (kind.type === "stones") {
    const gain = kind.min + Math.floor(Math.random() * (kind.max - kind.min + 1));
    await prisma.player.update({ where: { id: player.id }, data: { stones: { increment: gain } } });
    result = {
      type: "stones",
      text: `罗盘指向一堆灵石！+${gain} 灵石`,
      stonesGained: gain,
      jadesGained: 0,
      itemId: null,
      itemName: null,
      itemIcon: null,
      itemCount: 0,
    };
  } else if (kind.type === "jades") {
    const gain = kind.count ?? 1;
    await prisma.player.update({ where: { id: player.id }, data: { jades: { increment: gain } } });
    result = {
      type: "jades",
      text: `罗盘剧烈颤动——挖到了仙玉 ×${gain}！`,
      stonesGained: 0,
      jadesGained: gain,
      itemId: null,
      itemName: null,
      itemIcon: null,
      itemCount: 0,
    };
  } else if (kind.type === "crop") {
    const crop = CROPS[Math.floor(Math.random() * CROPS.length)];
    await prisma.playerInventory.upsert({
      where: { playerId_itemId: { playerId: player.id, itemId: crop.id } },
      create: { playerId: player.id, itemId: crop.id, quantity: 2 },
      update: { quantity: { increment: 2 } },
    });
    result = {
      type: "crop",
      text: `挖到一袋种子：${crop.icon} ${crop.name} ×2`,
      stonesGained: 0,
      jadesGained: 0,
      itemId: crop.id,
      itemName: crop.name,
      itemIcon: crop.icon,
      itemCount: 2,
    };
  } else {
    const tables = Object.values(GATHER_TABLES);
    const table = tables[Math.floor(Math.random() * tables.length)];
    const item = table.items[Math.floor(Math.random() * table.items.length)];
    await prisma.playerInventory.upsert({
      where: { playerId_itemId: { playerId: player.id, itemId: item.itemId } },
      create: { playerId: player.id, itemId: item.itemId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    result = {
      type: "material",
      text: `罗盘指向一处矿藏：${item.icon} ${item.name} ×1`,
      stonesGained: 0,
      jadesGained: 0,
      itemId: item.itemId,
      itemName: item.name,
      itemIcon: item.icon,
      itemCount: 1,
    };
  }

  await prisma.treasureLog.create({
    data: { playerId: player.id, date: today, rewardType: result.type, rewardText: result.text },
  });

  return result;
}
