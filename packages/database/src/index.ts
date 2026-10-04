import { PrismaClient } from "@prisma/client";
import { CROPS, GATHER_TABLES } from "@tavern/shared";

const globalForPrisma = globalThis as unknown as { tavernPrisma?: PrismaClient };

/** 全局单例，避免开发热重载时连接泄漏 */
export const prisma: PrismaClient = globalForPrisma.tavernPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.tavernPrisma = prisma;
}

/** 幂等种子：把共享内容表同步进 item_defs（作物 + 野外采集物）。启动时调用，生产环境同样安全。 */
export async function seedContent(): Promise<void> {
  let count = 0;
  for (const crop of CROPS) {
    await prisma.itemDef.upsert({
      where: { id: crop.id },
      create: {
        id: crop.id,
        name: crop.name,
        type: "crop",
        rarity: "common",
        basePrice: crop.sellPrice,
        icon: crop.icon,
        description: `作物：${crop.name}（${crop.growMinutes} 分钟成熟）`,
      },
      update: {
        name: crop.name,
        basePrice: crop.sellPrice,
        icon: crop.icon,
      },
    });
    count++;
  }
  for (const table of Object.values(GATHER_TABLES)) {
    for (const item of table.items) {
      await prisma.itemDef.upsert({
        where: { id: item.itemId },
        create: {
          id: item.itemId,
          name: item.name,
          type: "material",
          rarity: item.weight >= 30 ? "common" : item.weight >= 8 ? "rare" : "epic",
          basePrice: item.sellPrice,
          icon: item.icon,
          description: `野外采集物：${table.label}产出`,
        },
        update: {
          name: item.name,
          basePrice: item.sellPrice,
          icon: item.icon,
        },
      });
      count++;
    }
  }
  // 副本掉落特殊物品（图纸/碎片/雷击木）
  const specialItems: Array<[string, string, string, number]> = [
    ["bamboo_talisman", "青竹佩图纸", "🎐", 500],
    ["immortal_blueprint_frag", "仙品图纸残页", "📜", 2_000],
    ["tiandao_shard", "天道石碎片", "💠", 5_000],
    ["thunderwood", "雷击木", "🪵", 800],
  ];
  for (const [id, name, icon, price] of specialItems) {
    await prisma.itemDef.upsert({
      where: { id },
      create: { id, name, type: "material", rarity: "epic", basePrice: price, icon, description: "副本掉落" },
      update: { name, basePrice: price, icon },
    });
    count++;
  }
  console.log(`[db] 内容种子完成：${count} 种物品定义`);
}

export * from "@prisma/client";
