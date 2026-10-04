/**
 * 阶段 3 端到端测试：委托任务 / 境界突破 / 随机奇遇事件
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage3.mjs
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
const deviceToken = `e2e-s3-${Date.now()}`;

// 建号
let r = await api("/api/auth/guest", { method: "POST", body: { deviceToken, nickname: "三测修士" } });
const token = r.data.token;
const playerId = r.data.player.id;

console.log("== 1. 委托任务自动生成 ==");
r = await api("/api/quests", { token });
check("返回 3 个任务", r.status === 200 && r.data.length === 3, `count=${r.data?.length}`);
check("均为 active 且未完成", r.data.every((q) => q.progress === 0));

console.log("== 2. 种植推动任务进度 ==");
// 灵田初始 4 块，先扩到 2 级（6 块）再连种 5 株
await prisma.building.upsert({
  where: { playerId_type: { playerId, type: "farm" } },
  create: { playerId, type: "farm", level: 2, x: 0, y: 0 },
  update: { level: 2 },
});
for (let i = 0; i < 5; i++) {
  r = await api("/api/farm/plant", { method: "POST", token, body: { plotIndex: i, cropId: "spirit_rice" } });
  if (r.status !== 200) break;
}
check("连种 5 株成功", r.status === 200, JSON.stringify(r.data));
r = await api("/api/quests", { token });
const plantQuests = r.data.filter((q) => q.type === "plant");
check("种植任务（若生成）已完成", plantQuests.length === 0 || plantQuests.every((q) => q.progress >= q.target), JSON.stringify(plantQuests.map((q) => `${q.key}:${q.progress}/${q.target}`)));

console.log("== 3. 快进收获 + 强制奇遇 ==");
await prisma.farmPlot.updateMany({
  where: { playerId, cropId: { not: null } },
  data: { readyAt: new Date(Date.now() - 60_000) },
});
// 第一次收获强制触发奇遇，立即结算
r = await api("/api/farm/harvest", { method: "POST", token, body: { plotIndex: 0, forceEvent: true } });
check("收获成功且奇遇已触发", r.status === 200 && !!r.data.pendingEvent, JSON.stringify(r.data).slice(0, 200));
const pendingEventId = r.data.pendingEvent?.eventId;

console.log("== 4. 奇遇分支结算 ==");
r = await api("/api/event/resolve", { method: "POST", token, body: { eventId: pendingEventId, option: "A" } });
check("选项 A 结算成功", r.status === 200 && !!r.data.text, JSON.stringify(r.data).slice(0, 150));
r = await api("/api/event/resolve", { method: "POST", token, body: { eventId: pendingEventId, option: "A" } });
check("同一事件不可重复结算", r.status === 400);

// 剩余 4 块地正常收获（任务进度 +5 次收获）
for (let i = 1; i < 5; i++) {
  r = await api("/api/farm/harvest", { method: "POST", token, body: { plotIndex: i } });
  if (r.status !== 200) break;
}
check("剩余 4 块地收获成功", r.status === 200);

r = await api("/api/quests", { token });
const harvestQuests = r.data.filter((q) => q.type === "harvest");
check("收获任务（若生成）已完成", harvestQuests.length === 0 || harvestQuests.every((q) => q.progress >= q.target), JSON.stringify(harvestQuests.map((q) => `${q.key}:${q.progress}/${q.target}`)));

console.log("== 5. 出售推动任务并领取 ==");
r = await api("/api/shop/sell", { method: "POST", token, body: { itemId: "spirit_rice", quantity: 15 } });
check("出售 15 份成功", r.status === 200, JSON.stringify(r.data));
r = await api("/api/quests", { token });
const sellQuests = r.data.filter((q) => q.type === "sell");
check("出售任务（若生成）已完成", sellQuests.length === 0 || sellQuests.every((q) => q.progress >= q.target), JSON.stringify(sellQuests.map((q) => `${q.key}:${q.progress}/${q.target}`)));

const completed = r.data.filter((q) => q.progress >= q.target);
for (const q of completed) {
  const c = await api(`/api/quests/${q.id}/claim`, { method: "POST", token, body: {} });
  check(`领取「${q.name}」成功`, c.status === 200 && c.data.rewardStones > 0, JSON.stringify(c.data));
}

console.log("== 6. 境界满级封顶 ==");
await prisma.player.update({
  where: { id: playerId },
  data: { level: 10, exp: 298, stones: 600 },
});
r = await api("/api/farm/plant", { method: "POST", token, body: { plotIndex: 0, cropId: "spirit_rice" } });
check("10 级满修为时仍可种植", r.status === 200);
await prisma.farmPlot.updateMany({ where: { playerId, plotIndex: 0 }, data: { readyAt: new Date(Date.now() - 60_000) } });
r = await api("/api/farm/harvest", { method: "POST", token, body: { plotIndex: 0 } });
check("收获后等级停在 10（修为封顶 300/300）", r.data.newLevel === 10 && r.data.newRealm === "炼气", `level=${r.data.newLevel} exp=${r.data.expGained}`);

console.log("== 7. 筑基突破（100% 必成）==");
r = await api("/api/breakthrough", { token });
check("突破信息 available", r.data.available === true && r.data.successRate === 1, JSON.stringify(r.data));
r = await api("/api/breakthrough", { method: "POST", token, body: {} });
check("突破成功进入筑基", r.status === 200 && r.data.success === true && r.data.toRealm === "筑基", JSON.stringify(r.data));
r = await api("/api/player", { token });
check("等级 11 / 筑基", r.data.level === 11 && r.data.realm === "筑基");

console.log("== 8. 非满级不可突破 ==");
r = await api("/api/breakthrough", { token });
check("available=false", r.data.available === false);

console.log("== 9. 金丹突破守卫 ==");
await prisma.player.update({ where: { id: playerId }, data: { level: 20, exp: 800, stones: 5000 } });
r = await api("/api/breakthrough", { method: "POST", token, body: {} });
check("缺材料被拒（紫纹灵芝×5）", r.status === 400, `status=${r.status} msg=${JSON.stringify(r.data)}`);
await prisma.playerInventory.upsert({
  where: { playerId_itemId: { playerId, itemId: "purple_lingzhi" } },
  create: { playerId, itemId: "purple_lingzhi", quantity: 5 },
  update: {},
});
r = await api("/api/breakthrough", { token });
check("材料齐后 available 且成功率 80%", r.data.available === true && r.data.successRate === 0.8, JSON.stringify(r.data));

console.log("== 10. 失败冷却守卫 ==");
await prisma.player.update({
  where: { id: playerId },
  data: { breakthroughCooldownUntil: new Date(Date.now() + 3_600_000) },
});
r = await api("/api/breakthrough", { method: "POST", token, body: {} });
check("冷却中被拒", r.status === 400, `status=${r.status}`);
await prisma.player.update({ where: { id: playerId }, data: { breakthroughCooldownUntil: null } });

await prisma.$disconnect();
console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
