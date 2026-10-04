import { prisma, type Player } from "@tavern/database";
import {
  ACHIEVEMENT_DEFS,
  CODEX_CATEGORIES,
  CODEX_TIERS,
  codexTierCount,
  type AchievementDto,
  type AchievementsDto,
  type CodexCategoryDto,
  type CodexDto,
  type CodexRewardDto,
} from "@tavern/shared";

/**
 * 图鉴与成就（阶段9）：读取时惰性结算——
 * 图鉴条目按背包出现过的物品登记（卖出后保留）；成就按条件逐项判定，达成即发奖。
 */

// ---------- 图鉴 ----------

export async function sweepCodex(player: Player): Promise<CodexRewardDto[]> {
  const newly: CodexRewardDto[] = [];

  // 背包出现过的物品 → 登记图鉴
  const invRows = await prisma.playerInventory.findMany({ where: { playerId: player.id } });
  const invIds = new Set(invRows.map((r) => r.itemId));

  for (const cat of CODEX_CATEGORIES) {
    const missing = cat.itemIds.filter((id) => invIds.has(id));
    for (const itemId of missing) {
      await prisma.codexEntry.upsert({
        where: { playerId_category_itemId: { playerId: player.id, category: cat.key, itemId } },
        create: { playerId: player.id, category: cat.key, itemId },
        update: {},
      });
    }

    const unlocked = await prisma.codexEntry.count({
      where: { playerId: player.id, category: cat.key },
    });
    const claims = await prisma.codexClaim.findMany({
      where: { playerId: player.id, category: cat.key },
    });
    const claimedPcts = new Set(claims.map((c) => c.pct));

    for (const tier of CODEX_TIERS) {
      if (claimedPcts.has(tier.pct)) continue;
      const need = codexTierCount(cat.itemIds.length, tier.pct);
      if (unlocked >= need) {
        await prisma.$transaction([
          prisma.codexClaim.create({
            data: { playerId: player.id, category: cat.key, pct: tier.pct },
          }),
          prisma.player.update({
            where: { id: player.id },
            data: {
              stones: { increment: tier.stones },
              jades: { increment: tier.jades },
            },
          }),
        ]);
        newly.push({ category: cat.label, pct: tier.pct, stones: tier.stones, jades: tier.jades });
      }
    }
  }
  return newly;
}

export async function getCodex(player: Player): Promise<CodexDto> {
  const newlyRewarded = await sweepCodex(player);

  const categories: CodexCategoryDto[] = [];
  for (const cat of CODEX_CATEGORIES) {
    const unlocked = await prisma.codexEntry.count({
      where: { playerId: player.id, category: cat.key },
    });
    const claims = await prisma.codexClaim.findMany({
      where: { playerId: player.id, category: cat.key },
    });
    categories.push({
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      unlocked,
      total: cat.itemIds.length,
      pct: Math.round((unlocked / cat.itemIds.length) * 100),
      claimedTiers: claims.map((c) => c.pct),
    });
  }

  return { categories, newlyRewarded };
}

// ---------- 成就 ----------

async function conditionMet(player: Player, def: (typeof ACHIEVEMENT_DEFS)[number]): Promise<boolean> {
  const c = def.condition;
  switch (c.type) {
    case "newcomer":
      return true;
    case "revenue":
      return player.totalRevenue >= c.amount;
    case "level":
      return player.level >= c.level;
    case "battleWins":
      return (await prisma.battleLog.count({ where: { playerId: player.id, success: true } })) >= c.count;
    case "bambooWins":
      return (
        (await prisma.battleLog.count({
          where: { playerId: player.id, dungeonId: "bamboo_path", success: true },
        })) >= c.count
      );
    case "redHunts":
      return (
        (await prisma.attackLog.count({
          where: { attackerId: player.id, victimWasRed: true, success: true },
        })) >= c.count
      );
    case "codexCrops":
      return (
        (await prisma.codexEntry.count({ where: { playerId: player.id, category: "crops" } })) >= c.count
      );
    case "friends":
      return (
        (await prisma.friend.count({
          where: {
            status: "accepted",
            OR: [{ requesterId: player.userId }, { recipientId: player.userId }],
          },
        })) >= c.count
      );
    default:
      return false;
  }
}

export async function sweepAchievements(player: Player): Promise<string[]> {
  const existing = await prisma.achievement.findMany({ where: { playerId: player.id } });
  const unlockedIds = new Set(existing.map((a) => a.achievementId));
  const newly: string[] = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (unlockedIds.has(def.id)) continue;
    if (await conditionMet(player, def)) {
      await prisma.$transaction([
        prisma.achievement.create({
          data: { playerId: player.id, achievementId: def.id },
        }),
        prisma.player.update({
          where: { id: player.id },
          data: {
            stones: { increment: def.rewardStones },
            jades: { increment: def.rewardJades },
          },
        }),
      ]);
      newly.push(def.id);
    }
  }
  return newly;
}

export async function getAchievements(player: Player): Promise<AchievementsDto> {
  const newlyUnlocked = await sweepAchievements(player);
  const rows = await prisma.achievement.findMany({ where: { playerId: player.id } });
  const unlockedMap = new Map(rows.map((r) => [r.achievementId, r.unlockedAt]));

  const achievements: AchievementDto[] = ACHIEVEMENT_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    desc: def.desc,
    icon: def.icon,
    unlocked: unlockedMap.has(def.id),
    unlockedAt: unlockedMap.get(def.id)?.toISOString() ?? null,
    rewardStones: def.rewardStones,
    rewardJades: def.rewardJades,
  }));

  return {
    achievements,
    unlockedCount: rows.length,
    total: ACHIEVEMENT_DEFS.length,
    newlyUnlocked,
  };
}
