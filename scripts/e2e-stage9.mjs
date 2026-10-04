/**
 * 阶段 9 端到端测试：图鉴与成就
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage9.mjs
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.E2E_BASE ?? "http://localhost:4000";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&pgbouncer=true";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
const uniq = Date.now().toString(36);

const r0 = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s9-${uniq}`, nickname: `收藏家${uniq.slice(-4)}` } });
const token = r0.data.token;
const playerId = r0.data.player.id;

console.log("== 1. 初来乍到成就 ==");
let r = await api("/api/achievements", { token });
check("成就系统返回 12 个成就", r.data.achievements.length === 12, `n=${r.data.achievements?.length}`);
check("初来乍到自动解锁", r.data.newlyUnlocked.includes("newcomer"), JSON.stringify(r.data.newlyUnlocked));
r = await api("/api/player", { token });
check("奖励 +100 灵石", r.data.stones === 200, `stones=${r.data.stones}`); // 初始100+成就100
r = await api("/api/achievements", { token });
check("重复领取不重复发放", r.data.newlyUnlocked.length === 0);

console.log("== 2. 图鉴登记与梯度奖励 ==");
r = await api("/api/codex", { token });
check("初始图鉴 0/13", r.data.categories[0].unlocked === 0 && r.data.categories[0].total === 13);
// 背包塞 2 种作物 → 10% 档（ceil(13*0.1)=2）
for (const crop of ["spirit_rice", "green_spirit_grass"]) {
  await prisma.playerInventory.upsert({
    where: { playerId_itemId: { playerId, itemId: crop } },
    create: { playerId, itemId: crop, quantity: 1 },
    update: {},
  });
}
r = await api("/api/codex", { token });
check("登记 2 种作物", r.data.categories[0].unlocked === 2, JSON.stringify(r.data.categories[0]));
check("10% 档奖励发放（500 灵石）", r.data.newlyRewarded.some((x) => x.pct === 0.1 && x.stones === 500), JSON.stringify(r.data.newlyRewarded));
r = await api("/api/codex", { token });
check("同档位不重复发奖", r.data.newlyRewarded.length === 0);

console.log("== 3. 成就条件判定 ==");
// 营业额 1200 → 第一桶金
await prisma.player.update({ where: { id: playerId }, data: { totalRevenue: 1_200, level: 11 } });
r = await api("/api/achievements", { token });
check("第一桶金解锁", r.data.newlyUnlocked.includes("first_gold"), JSON.stringify(r.data.newlyUnlocked));
check("登堂入室（11级）解锁", r.data.newlyUnlocked.includes("foundation"));

// 副本通关 3 次青竹林 → 竹妖杀手
await prisma.battleLog.createMany({
  data: [1, 2, 3].map(() => ({
    playerId,
    dungeonId: "bamboo_path",
    success: true,
  })),
});
r = await api("/api/achievements", { token });
check("竹妖杀手解锁", r.data.newlyUnlocked.includes("bamboo_killer"), JSON.stringify(r.data.newlyUnlocked));

// 讨伐红名 1 次 → 夜行者
const victim = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s9v-${uniq}`, nickname: "红名" } });
await prisma.attackLog.create({
  data: { attackerId: playerId, victimId: victim.data.player.id, success: true, victimWasRed: true },
});
r = await api("/api/achievements", { token });
check("夜行者解锁", r.data.newlyUnlocked.includes("night_walker"));

// 好友 5 人 → 四海皆友
const u = await prisma.player.findUnique({ where: { id: playerId } });
for (let i = 0; i < 5; i++) {
  const f = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s9f-${uniq}-${i}`, nickname: `友${i}${uniq.slice(-4)}` } });
  await prisma.friend.create({
    data: { requesterId: u.userId, recipientId: (await prisma.player.findUnique({ where: { id: f.data.player.id } })).userId, status: "accepted" },
  });
}
r = await api("/api/achievements", { token });
check("四海皆友解锁", r.data.newlyUnlocked.includes("popular"), JSON.stringify(r.data.newlyUnlocked));

console.log("== 4. 神农尝百草（13 种作物全收集）==");
const allCrops = [
  "spirit_rice", "green_spirit_grass", "scarlet_fruit", "snow_lotus", "mist_tea", "black_ginseng",
  "purple_lingzhi", "flame_pepper", "ice_soul_fruit", "golden_rice", "blood_bodhi", "illusion_flower", "thunderwood_sprout",
];
for (const crop of allCrops) {
  await prisma.playerInventory.upsert({
    where: { playerId_itemId: { playerId, itemId: crop } },
    create: { playerId, itemId: crop, quantity: 1 },
    update: {},
  });
}
r = await api("/api/codex", { token });
check("作物图鉴 13/13", r.data.categories[0].unlocked === 13);
r = await api("/api/achievements", { token });
check("神农尝百草解锁（+30 仙玉）", r.data.newlyUnlocked.includes("shennong"), JSON.stringify(r.data.newlyUnlocked));
r = await api("/api/player", { token });
check("仙玉到账", r.data.jades >= 30, `jades=${r.data.jades}`);

await prisma.$disconnect();
console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
