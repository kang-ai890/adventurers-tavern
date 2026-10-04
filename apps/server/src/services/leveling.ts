import { prisma, type Player } from "@tavern/database";
import { expToNext, isRealmCapLevel, realmOfLevel } from "@tavern/shared";

/**
 * 修为结算：加经验 + 自动升级。
 * 境界满级（10 的倍数）时修为封顶，等待突破（见 services/breakthrough.ts）。
 */
export async function addExp(
  player: Player,
  amount: number,
): Promise<{ level: number; levelUps: number; exp: number; realm: string }> {
  let exp = player.exp + amount;
  let level = player.level;
  let levelUps = 0;

  while (exp >= expToNext(level)) {
    if (isRealmCapLevel(level)) {
      exp = Math.min(exp, expToNext(level)); // 封顶，等突破
      break;
    }
    exp -= expToNext(level);
    level += 1;
    levelUps += 1;
  }

  await prisma.player.update({
    where: { id: player.id },
    data: { exp, level, realm: realmOfLevel(level) },
  });

  return { level, levelUps, exp, realm: realmOfLevel(level) };
}
