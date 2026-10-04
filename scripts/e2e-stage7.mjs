/**
 * 阶段 7 端到端测试：每日签到（7天一轮）与寻宝罗盘（每日3次）
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage7.mjs
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

const r0 = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s7-${uniq}`, nickname: `签到客${uniq.slice(-4)}` } });
const token = r0.data.token;
const playerId = r0.data.player.id;

const dateStr = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

console.log("== 1. 初始状态 ==");
let r = await api("/api/daily", { token });
check("未签到 streak=0，下一奖励第1天", r.status === 200 && r.data.streak === 0 && r.data.nextReward.day === 1, JSON.stringify(r.data));
check("寻宝剩余 3 次", r.data.treasureLeft === 3);

console.log("== 2. 第一天签到 ==");
r = await api("/api/checkin", { method: "POST", token, body: {} });
check("签到第 1 天：灵石 +50", r.status === 200 && r.data.day === 1 && r.data.rewardStones === 50, JSON.stringify(r.data));
check("连续签到 1 天", r.data.streak === 1);
r = await api("/api/checkin", { method: "POST", token, body: {} });
check("重复签到被拒", r.status === 400, `status=${r.status}`);
r = await api("/api/daily", { token });
check("状态：已签到，下一奖励第2天（60灵石）", r.data.checkedInToday === true && r.data.nextReward.day === 2 && r.data.nextReward.stones === 60);

console.log("== 3. 连续签到与轮次 ==");
// 重置今天的签到，补昨天与前天记录，模拟连续第 3 天
await prisma.checkinLog.deleteMany({ where: { playerId, date: dateStr(0) } });
for (const offset of [1, 2]) {
  await prisma.checkinLog.create({
    data: { playerId, date: dateStr(-offset), rewardStones: 50 },
  });
}
r = await api("/api/checkin", { method: "POST", token, body: {} });
// 今天为第3天：streak = 昨天2 + 今天 = 3 → 奖励索引 2 = 第3天 80 灵石
check("连续第 3 天：灵石 +80", r.status === 200 && r.data.day === 3 && r.data.rewardStones === 80 && r.data.streak === 3, JSON.stringify(r.data));

console.log("== 4. 第 7 天大礼（仙玉）==");
// 重置今天，补前 3~6 天记录，使今天成为第 7 天
await prisma.checkinLog.deleteMany({ where: { playerId, date: dateStr(0) } });
for (const offset of [3, 4, 5, 6]) {
  await prisma.checkinLog.create({
    data: { playerId, date: dateStr(-offset), rewardStones: 50 },
  });
}
r = await api("/api/checkin", { method: "POST", token, body: {} });
// streak = 6(昨天为止) → 今天索引 6 = 第7天：200 灵石 + 3 仙玉
check("第 7 天大礼：200 灵石 + 3 仙玉", r.status === 200 && r.data.day === 7 && r.data.rewardStones === 200 && r.data.rewardJades === 3, JSON.stringify(r.data));
r = await api("/api/player", { token });
check("玩家仙玉 +3", r.data.jades === 3, `jades=${r.data.jades}`);

console.log("== 5. 寻宝罗盘 ==");
let treasuresOk = 0;
for (let i = 0; i < 3; i++) {
  r = await api("/api/treasure", { method: "POST", token, body: {} });
  if (r.status === 200 && r.data.text) treasuresOk++;
}
check("3 次寻宝全部成功", treasuresOk === 3, `ok=${treasuresOk}`);
r = await api("/api/treasure", { method: "POST", token, body: {} });
check("第 4 次被拒（每日 3 次）", r.status === 400, `status=${r.status}`);
r = await api("/api/daily", { token });
check("寻宝剩余 0 次", r.data.treasureLeft === 0);

await prisma.$disconnect();
console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
