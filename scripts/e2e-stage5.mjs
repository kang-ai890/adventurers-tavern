/**
 * 阶段 5 端到端测试：公共广场（Socket）
 * - JWT 真实身份接入（道号/境界/口碑上屏）
 * - 分线人数与自动选线
 * - 视野内移动同步 / 视野外不同步
 * - 摆摊展示与收摊
 * 前置：本地数据库 + 后端已启动
 * 用法：node scripts/e2e-stage5.mjs
 */
import { io } from "socket.io-client";

const BASE = process.env.E2E_BASE ?? "http://localhost:4000";
const WS = process.env.E2E_WS ?? "http://localhost:4000";

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

const uniq = Date.now().toString(36);

// 两个玩家 REST 登录
const A = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s5-a-${uniq}`, nickname: `坊主${uniq.slice(-4)}` } });
const B = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s5-b-${uniq}`, nickname: `散修${uniq.slice(-4)}` } });
check("两个玩家 REST 登录", A.status === 200 && B.status === 200);

function waitFor(sock, event, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${event} 超时`)), timeoutMs);
    sock.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const sockA = io(WS, { transports: ["websocket"] });
const sockB = io(WS, { transports: ["websocket"] });

await Promise.all([
  new Promise((r) => sockA.on("connect", r)),
  new Promise((r) => sockB.on("connect", r)),
]);

console.log("== 1. 广场状态与分线 ==");
const plaza = await api("/api/plaza");
check("REST 返回分线容量", plaza.data.capacity === 50 && Array.isArray(plaza.data.lines), JSON.stringify(plaza.data));

console.log("== 2. JWT 接入真实身份 ==");
const la = waitFor(sockA, "loginResult");
const lb = waitFor(sockB, "loginResult");
sockA.emit("login", { token: A.data.token });
sockB.emit("login", { token: B.data.token });
check("A 登录成功", (await la).ok === true);
check("B 登录成功", (await lb).ok === true);

console.log("== 3. 加入广场看到真实道号 ==");
const pa = waitFor(sockA, "plazaPlayers");
sockA.emit("plazaJoin", { line: 1 });
const aView = await pa;
check("A 收到广场快照", aView.players.length >= 1);
const aMe = aView.players.find((p) => p.nickname === `坊主${uniq.slice(-4)}`);
check("A 快照含自己真实道号与境界", !!aMe && aMe.realm === "炼气" && aMe.id === A.data.player.id, JSON.stringify(aMe));

const pb = waitFor(sockB, "plazaPlayers");
sockB.emit("plazaJoin", { line: 1 });
const bView = await pb;
check("B 加入同线看到 A", bView.players.some((p) => p.nickname === `坊主${uniq.slice(-4)}`));

console.log("== 4. 视野内移动同步 ==");
// A 移动到 B 附近（B 出生点未知，先让 B 报告自己位置）
const bMe = bView.players.find((p) => p.nickname === `散修${uniq.slice(-4)}`);
const targetX = bMe.x + 3;
const targetY = bMe.y;
const movedP = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 4000);
  sockB.on("plazaPlayerMoved", (p) => {
    if (p.id === A.data.player.id) {
      clearTimeout(timer);
      resolve(p);
    }
  });
});
sockA.emit("plazaMove", { x: targetX, y: targetY, direction: "right" });
const moved = await movedP;
check("B 收到 A 的移动（视野内）", !!moved && moved.x === targetX, JSON.stringify(moved));

console.log("== 5. 视野外移动不同步 ==");
let farMoved = false;
sockB.on("plazaPlayerMoved", (p) => {
  if (p.id === A.data.player.id) farMoved = true;
});
// A 瞬移到地图另一端（>15 格）
sockA.emit("plazaMove", { x: 990, y: 990, direction: "left" });
await new Promise((r) => setTimeout(r, 800));
check("B 收不到视野外的移动", farMoved === false);

console.log("== 6. 摆摊展示与收摊 ==");
// 给 A 备货
await api("/api/farm/plant", { method: "POST", token: A.data.token, body: { plotIndex: 0, cropId: "spirit_rice" } });
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&pgbouncer=true",
});
await prisma.farmPlot.updateMany({ where: { playerId: A.data.player.id, plotIndex: 0 }, data: { readyAt: new Date(Date.now() - 60_000) } });
await api("/api/farm/harvest", { method: "POST", token: A.data.token, body: { plotIndex: 0 } });

// B 回到 A 视野（A 在 990,990，B 移动过去）
sockB.emit("plazaMove", { x: 988, y: 990, direction: "left" });
await new Promise((r) => setTimeout(r, 300));
const stallUpd = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 4000);
  sockB.on("plazaStallUpdate", (p) => {
    if (p.id === A.data.player.id && p.stall) {
      clearTimeout(timer);
      resolve(p.stall);
    }
  });
});
sockA.emit("plazaStall", { title: "灵米铺", itemId: "spirit_rice", price: 20 });
const stall = await stallUpd;
check("B 看到 A 的摊位", !!stall && stall.title === "灵米铺" && stall.price === 20, JSON.stringify(stall));

const stallClose = new Promise((resolve) => {
  const timer = setTimeout(() => resolve("timeout"), 4000);
  sockB.on("plazaStallUpdate", (p) => {
    if (p.id === A.data.player.id && p.stall === null) {
      clearTimeout(timer);
      resolve("closed");
    }
  });
});
sockA.emit("plazaStallClose");
check("收摊广播 stall=null", (await stallClose) === "closed");

console.log("== 7. 广场聊天带真实道号 ==");
const chatP = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 4000);
  sockB.on("plazaChat", (m) => {
    if (m.senderName === `坊主${uniq.slice(-4)}`) {
      clearTimeout(timer);
      resolve(m);
    }
  });
});
sockA.emit("plazaChat", { text: "道友留步，买灵米吗？" });
const chatMsg = await chatP;
check("B 收到 A 的聊天且道号正确", !!chatMsg && chatMsg.text === "道友留步，买灵米吗？");

console.log("== 8. 断线清理 ==");
const leftP = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 4000);
  sockB.on("plazaPlayerLeft", (p) => {
    if (p.id === A.data.player.id) {
      clearTimeout(timer);
      resolve(p);
    }
  });
});
sockA.disconnect();
check("B 收到 A 离场通知", (await leftP) !== null);

sockB.disconnect();
await prisma.$disconnect();

console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
