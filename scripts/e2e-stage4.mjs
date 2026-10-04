/**
 * 阶段 4 端到端测试：酒馆顾客与口碑 / 好友 / 拜访浇水
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage4.mjs
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

// 两个玩家 + 一个陌生人
const mk = async (name) => {
  const r = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s4-${uniq}-${name}`, nickname: name } });
  return { token: r.data.token, id: r.data.player.id };
};
const A = await mk(`掌柜${uniq.slice(-4)}`);
const B = await mk(`道友${uniq.slice(-4)}`);
const C = await mk(`路人${uniq.slice(-4)}`);

console.log("== 1. 好友申请与接受 ==");
let r = await api("/api/friends/request", { method: "POST", token: A.token, body: { ref: `道友${uniq.slice(-4)}` } });
check("A 按道号申请 B", r.status === 200, JSON.stringify(r.data));
r = await api("/api/friends", { token: B.token });
check("B 看到待处理申请", r.data.pendingIn?.length === 1, JSON.stringify(r.data.pendingIn));
const friendId = r.data.pendingIn?.[0]?.friendId;
r = await api("/api/friends/accept", { method: "POST", token: B.token, body: { friendId } });
check("B 接受申请", r.status === 200 && r.data.ok === true);
r = await api("/api/friends", { token: A.token });
check("A 好友列表有 B", r.data.friends?.length === 1 && r.data.friends[0].nickname === `道友${uniq.slice(-4)}`, JSON.stringify(r.data.friends));

console.log("== 2. 非好友不可拜访 ==");
r = await api(`/api/visit/${B.id}`, { token: C.token });
check("陌生人拜访被拒 403", r.status === 403, `status=${r.status}`);

console.log("== 3. 拜访视图 ==");
r = await api(`/api/visit/${B.id}`, { token: A.token });
check("好友可看到对方领地", r.status === 200 && r.data.nickname === `道友${uniq.slice(-4)}`, JSON.stringify(r.data).slice(0, 120));

console.log("== 4. 浇水加速与奖励 ==");
// B 种一株灵米（10 分钟）
r = await api("/api/farm/plant", { method: "POST", token: B.token, body: { plotIndex: 0, cropId: "spirit_rice" } });
check("B 种下灵米", r.status === 200);
await prisma.farmPlot.updateMany({
  where: { playerId: B.id, plotIndex: 0 },
  data: { readyAt: new Date(Date.now() + 10 * 60_000) },
});
r = await api(`/api/visit/${B.id}`, { token: A.token });
const before = new Date(r.data.plots[0].readyAt).getTime();
const aStonesBefore = (await api("/api/player", { token: A.token })).data.stones;

r = await api(`/api/visit/${B.id}/water`, { method: "POST", token: A.token, body: { plotIndex: 0 } });
check("浇水成功 -5%", r.status === 200 && r.data.speedupPercent === 5, JSON.stringify(r.data));
const after = new Date(r.data.newReadyAt).getTime();
check("剩余时间缩短约 5%（10分钟→9.5分钟）", Math.abs((before - after) - 30_000) < 5_000, `${before - after}ms`);
const aStonesAfter = (await api("/api/player", { token: A.token })).data.stones;
check("浇水者得 10 灵石", aStonesAfter - aStonesBefore === 10, `${aStonesBefore}->${aStonesAfter}`);
r = await api("/api/friends", { token: A.token });
check("亲密度 +2", r.data.friends[0].affinity === 2, `affinity=${r.data.friends[0].affinity}`);

console.log("== 5. 每日浇水上限 ==");
for (let i = 0; i < 4; i++) {
  await api(`/api/visit/${B.id}/water`, { method: "POST", token: A.token, body: { plotIndex: 0 } });
}
r = await api(`/api/visit/${B.id}/water`, { method: "POST", token: A.token, body: { plotIndex: 0 } });
check("第 6 次被拒（每日 5 次）", r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

console.log("== 6. 顾客到店 ==");
r = await api("/api/tavern", { token: A.token });
check("酒馆初始无订单", r.status === 200 && r.data.orders?.length === 0, JSON.stringify(r.data).slice(0, 150));
check("口碑 Lv.0 客流 6/时", r.data.fameLevel === 0 && r.data.customersPerHour === 6);
// 快进 2 小时
await prisma.player.update({
  where: { id: A.id },
  data: { lastCustomerGenAt: new Date(Date.now() - 2 * 3_600_000) },
});
r = await api("/api/tavern", { token: A.token });
check("2 小时来客 12 位（6×2，上限12）", r.data.orders?.length === 12, `orders=${r.data.orders?.length}`);

console.log("== 7. 招待顾客 ==");
const first = r.data.orders[0];
// 给 A 备货
await prisma.playerInventory.upsert({
  where: { playerId_itemId: { playerId: A.id, itemId: first.itemId } },
  create: { playerId: A.id, itemId: first.itemId, quantity: 50 },
  update: { quantity: 50 },
});
r = await api("/api/tavern/serve", { method: "POST", token: A.token, body: { orderId: first.id } });
check("招待成功入账", r.status === 200 && r.data.stonesGained === first.price, JSON.stringify(r.data));
check("营业额与口碑数据更新", r.data.totalRevenue === first.price && r.data.fameLevel === 0);
r = await api("/api/tavern/serve", { method: "POST", token: A.token, body: { orderId: first.id } });
check("重复招待被拒", r.status === 404, `status=${r.status}`);

console.log("== 8. 口碑升级 ==");
await prisma.player.update({ where: { id: A.id }, data: { totalRevenue: 600 } });
r = await api("/api/tavern", { token: A.token });
check("营业额 600 → 口碑 Lv.1", r.data.fameLevel === 1 && r.data.customersPerHour === 8, JSON.stringify({ lv: r.data.fameLevel, cph: r.data.customersPerHour }));
r = await api("/api/player", { token: A.token });
check("玩家数据同步口碑等级", r.data.fameLevel === 1);

console.log("== 9. 缺货被拒 ==");
await prisma.playerInventory.updateMany({ where: { playerId: A.id }, data: { quantity: 0 } });
r = await api("/api/tavern", { token: A.token });
const second = r.data.orders[0];
r = await api("/api/tavern/serve", { method: "POST", token: A.token, body: { orderId: second.id } });
check("货不够返回 400", r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

console.log("== 10. 解除好友后不可拜访 ==");
r = await api("/api/friends/remove", { method: "POST", token: B.token, body: { friendId } });
check("B 解除好友", r.status === 200 && r.data.ok === true);
r = await api(`/api/visit/${B.id}`, { token: A.token });
check("解除后拜访被拒 403", r.status === 403, `status=${r.status}`);

await prisma.$disconnect();
console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
