import { prisma, type Player, type Quest } from "@tavern/database";
import { DAILY_QUEST_COUNT, QUEST_DEFS, type QuestClaimResultDto, type QuestDto } from "@tavern/shared";
import { httpError } from "../auth.js";
import { addExp } from "./leveling.js";

/** 确保当日任务已生成（不足 3 个则补足），返回全部未过期任务 */
export async function ensureDailyQuests(player: Player): Promise<Quest[]> {
  const now = new Date();
  const active = await prisma.quest.findMany({
    where: { playerId: player.id, status: "active", expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
  });
  if (active.length >= DAILY_QUEST_COUNT) return active;

  const usedKeys = new Set(active.map((q) => q.questKey));
  const pool = QUEST_DEFS.filter((d) => !usedKeys.has(d.key));
  // 洗牌
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const missing = DAILY_QUEST_COUNT - active.length;
  const picked = pool.slice(0, Math.min(missing, pool.length));

  const created: Quest[] = [];
  for (const def of picked) {
    const quest = await prisma.quest.create({
      data: {
        playerId: player.id,
        questKey: def.key,
        target: def.targetCount,
        rewardStones: def.rewardStones,
        rewardExp: def.rewardExp,
        expiresAt: new Date(now.getTime() + def.durationHours * 3_600_000),
      },
    });
    created.push(quest);
  }
  return [...active, ...created];
}

export async function questDtos(quests: Quest[]): Promise<QuestDto[]> {
  const defMap = new Map(QUEST_DEFS.map((d) => [d.key, d]));
  return quests.map((q) => {
    const def = defMap.get(q.questKey);
    return {
      id: q.id,
      key: q.questKey,
      name: def?.name ?? q.questKey,
      type: (def?.type ?? "harvest") as QuestDto["type"],
      progress: q.progress,
      target: q.target,
      rewardStones: q.rewardStones,
      rewardExp: q.rewardExp,
      completed: q.progress >= q.target,
      expiresAt: q.expiresAt.toISOString(),
    };
  });
}

/** 领取任务奖励 */
export async function claimQuest(player: Player, questId: string): Promise<QuestClaimResultDto> {
  const quest = await prisma.quest.findFirst({
    where: { id: questId, playerId: player.id, status: "active" },
  });
  if (!quest) throw httpError(404, "任务不存在");
  if (quest.expiresAt.getTime() <= Date.now()) throw httpError(400, "任务已过期");
  if (quest.progress < quest.target) throw httpError(400, "任务尚未完成");

  await prisma.quest.update({
    where: { id: quest.id },
    data: { status: "claimed", claimedAt: new Date() },
  });

  await prisma.player.update({
    where: { id: player.id },
    data: { stones: { increment: quest.rewardStones } },
  });
  const levelResult = await addExp(player, quest.rewardExp);

  return {
    questId: quest.id,
    rewardStones: quest.rewardStones,
    rewardExp: quest.rewardExp,
    levelUps: levelResult.levelUps,
    newLevel: levelResult.level,
  };
}

/** 经营动作推动任务进度（种植/收获 +1，出售 +数量） */
export async function progressQuests(playerId: string, type: "plant" | "harvest" | "sell", amount: number): Promise<void> {
  await prisma.quest.updateMany({
    where: { playerId, status: "active", questKey: { in: QUEST_DEFS.filter((d) => d.type === type).map((d) => d.key) }, expiresAt: { gt: new Date() } },
    data: { progress: { increment: amount } },
  });
  // 封顶到 target
  const rows = await prisma.quest.findMany({
    where: { playerId, status: "active", expiresAt: { gt: new Date() } },
  });
  for (const q of rows) {
    if (q.progress > q.target) {
      await prisma.quest.update({ where: { id: q.id }, data: { progress: q.target } });
    }
  }
}
