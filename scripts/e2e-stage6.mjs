/**
 * 阶段 6 端到端测试：野外采集 / 自由PK / 红名悬赏
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage6.mjs
 */
import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";

const BASE = process.env.E2E_BASE ?? "http://localhost:4000";
const WS = process.env.E2E_WS ?? "http://localhost:4000";
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

const mk = async (name) => {
  const r = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s6-${uniq}-${name}`, nickname: name } });
  return { token: r.data.token, id: r.data.player.id };
};
const A = await mk(`劫修${uniq.slice(-4)}`);
const B = await mk(`采药人${uniq.slice(-4)}`);
const C = await mk(`凡人${uniq.slice(-4)}`);

// A、B 升到筑基（11级），补给体力与灵石
await prisma.player.update({ where: { id: A.id }, data: { level: 11, energy: 100, stones: 1_000 } });
await prisma.player.update({ where: { id: B.id }, data: { level: 11, energy: 100, stones: 1_000 } });

console.log("== 1. 境界门槛 ==");
let r = await api("/api/wild", { token: C.token });
check("凡人不可进野外（unlocked=false）", r.data.unlocked === false);
r = await api("/api/wild/enter", { method: "POST", token: C.token, body: {} });
check("凡人进入被拒 400", r.status === 400, `status=${r.status}`);

console.log("== 2. 进入野外与在野名单 ==");
r = await api("/api/wild/enter", { method: "POST", token: A.token, body: {} });
check("A 进入野外", r.status === 200);
r = await api("/api/wild/enter", { method: "POST", token: B.token, body: {} });
check("B 进入野外", r.status === 200);
r = await api("/api/wild", { token: A.token });
check("A 的在野名单里有 B", r.data.wildPlayers.some((w) => w.playerId === B.id), JSON.stringify(r.data.wildPlayers));

console.log("== 3. 采集（体力消耗与产出）==");
const e0 = (await api("/api/player", { token: A.token })).data.energy;
r = await api("/api/wild/gather", { method: "POST", token: A.token, body: { spotType: "fish" } });
check("钓鱼成功返回物品", r.status === 200 && !!r.data.itemId && r.data.energyLeft === e0 - 1, JSON.stringify(r.data));
r = await api("/api/wild/gather", { method: "POST", token: A.token, body: { spotType: "mine" } });
check("挖矿成功", r.status === 200 && !!r.data.itemId);
r = await api("/api/wild/gather", { method: "POST", token: A.token, body: { spotType: "herb" } });
check("采药成功", r.status === 200 && !!r.data.itemId);
const Ainv = await api("/api/farm", { token: A.token });
check("背包里有采集物", Ainv.data.inventory.length >= 3, JSON.stringify(Ainv.data.inventory.map((i) => i.name)));

console.log("== 4. 袭击抢夺（胜）==");
await prisma.playerInventory.upsert({
  where: { playerId_itemId: { playerId: B.id, itemId: "dragon_fish" } },
  create: { playerId: B.id, itemId: "dragon_fish", quantity: 10 },
  update: { quantity: 10 },
});
r = await api("/api/wild/attack", { method: "POST", token: A.token, body: { targetPlayerId: B.id, forceWin: true } });
check("袭击成功", r.status === 200 && r.data.success === true, JSON.stringify(r.data).slice(0, 200));
const looted = r.data.loot.find((l) => l.itemId === "dragon_fish");
check("抢到龙须鱼（10×15%=1）", !!looted && looted.quantity === 1, JSON.stringify(r.data.loot));
check("杀孽 +100", r.data.killScoreNow === 100, `killScore=${r.data.killScoreNow}`);

console.log("== 5. 红名悬赏榜 ==");
r = await api("/api/bounty", { token: B.token });
const entry = r.data.bounty.find((b) => b.playerId === A.id);
check("A 登上悬赏榜", !!entry && entry.killScore === 100, JSON.stringify(entry));
check("悬赏金额 = 100×20×1.2 = 2400", entry?.bounty === 2_400, `bounty=${entry?.bounty}`);

console.log("== 6. 同目标冷却 ==");
r = await api("/api/wild/attack", { method: "POST", token: A.token, body: { targetPlayerId: B.id, forceWin: true } });
check("30 分钟冷却被拒", r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);

console.log("== 7. 讨伐红名（不涨杀孽 + 领悬赏）==");
r = await api("/api/wild/attack", { method: "POST", token: B.token, body: { targetPlayerId: A.id, forceWin: true } });
check("B 讨伐成功", r.status === 200 && r.data.success === true && r.data.victimWasRed === true, JSON.stringify(r.data).slice(0, 200));
check("B 领到悬赏 2400 灵石", r.data.bountyReward === 2_400, `bounty=${r.data.bountyReward}`);
check("B 杀孽保持 0", r.data.killScoreNow === 0);
r = await api("/api/bounty", { token: B.token });
const entry2 = r.data.bounty.find((b) => b.playerId === A.id);
check("A 杀孽减至 50", entry2?.killScore === 50, JSON.stringify(entry2));
check("悬赏降为 1200", entry2?.bounty === 1_200, `bounty=${entry2?.bounty}`);

console.log("== 8. 袭击失败惩罚 ==");
await prisma.playerInventory.upsert({
  where: { playerId_itemId: { playerId: A.id, itemId: "blue_carp" } },
  create: { playerId: A.id, itemId: "blue_carp", quantity: 10 },
  update: { quantity: 10 },
});
// A 刚袭击过 B（冷却中），换 C... C 等级不够。用 B 攻击 A 已被冷却? B→A 刚打过（讨伐），冷却 30 分钟。
// 因此失败路径改用：A 打 C 会因 C 未筑基被拒——这里先给 C 升筑基
await prisma.player.update({ where: { id: C.id }, data: { level: 11 } });
r = await api("/api/wild/attack", { method: "POST", token: A.token, body: { targetPlayerId: C.id, forceLose: true } });
check("袭击失败返回 success=false", r.status === 200 && r.data.success === false, JSON.stringify(r.data).slice(0, 200));
const lostCarp = r.data.loot.find((l) => l.itemId === "blue_carp");
check("失败掉 10% 采集物（青鱼×1）", !!lostCarp && lostCarp.quantity === 1, JSON.stringify(r.data.loot));

console.log("== 9. 杀孽自然衰减（-1/小时）==");
await prisma.player.update({
  where: { id: A.id },
  data: { killScore: 60, killScoreUpdatedAt: new Date(Date.now() - 100 * 3_600_000) },
});
r = await api("/api/bounty", { token: B.token });
check("100 小时后杀孽 60→0，A 不在榜上", !r.data.bounty.some((b) => b.playerId === A.id));

console.log("== 10. 红名禁入坊市（Socket）==");
await prisma.player.update({
  where: { id: A.id },
  data: { killScore: 100, killScoreUpdatedAt: new Date() },
});
const sockA = io(WS, { transports: ["websocket"] });
await new Promise((res) => sockA.on("connect", res));
const loginP = new Promise((res) => sockA.once("loginResult", res));
sockA.emit("login", { token: A.token });
await loginP;
const rejectP = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 4000);
  sockA.on("notification", (n) => {
    if (n.title.includes("守卫") || n.title.includes("红名")) {
      clearTimeout(timer);
      resolve(n);
    }
  });
});
sockA.emit("plazaJoin", { line: 1 });
const notif = await rejectP;
check("红名被守卫拦截", !!notif, JSON.stringify(notif));
sockA.disconnect();

// 清理：A 洗白
await prisma.player.update({ where: { id: A.id }, data: { killScore: 0 } });

await prisma.$disconnect();
console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
