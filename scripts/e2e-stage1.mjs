/**
 * 阶段 1 端到端冒烟测试：游客登录 → 种灵米 → (快进时间) → 收获 → 出售 → 建筑升级校验
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage1.mjs
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
const deviceToken = `e2e-${Date.now()}`;

console.log("== 1. 游客登录 ==");
let r = await api("/api/auth/guest", { method: "POST", body: { deviceToken, nickname: "测试修士" } });
check("登录成功并返回 token", r.status === 200 && !!r.data.token, JSON.stringify(r.data));
check("初始灵石 100", r.data.player?.stones === 100, `stones=${r.data.player?.stones}`);
check("初始等级 1 / 炼气", r.data.player?.level === 1 && r.data.player?.realm === "炼气");
const token = r.data.token;
const playerId = r.data.player?.id;

console.log("== 2. 查看领地 ==");
r = await api("/api/farm", { token });
check("默认 4 块地", r.data.plotCount === 4, `plotCount=${r.data.plotCount}`);
check("建筑灵田 Lv.1", r.data.buildings?.[0]?.level === 1);

console.log("== 3. 种植灵米 ==");
r = await api("/api/farm/plant", { method: "POST", token, body: { plotIndex: 0, cropId: "spirit_rice" } });
check("种植成功，花费 5 灵石", r.status === 200 && r.data.stonesLeft === 95, JSON.stringify(r.data));
check("成熟时间约 10 分钟", Math.abs(new Date(r.data.readyAt) - Date.now() - 600_000) < 5_000);

console.log("== 4. 未成熟时收获应被拒绝 ==");
r = await api("/api/farm/harvest", { method: "POST", token, body: { plotIndex: 0 } });
check("返回 400 且提示未成熟", r.status === 400, `status=${r.status}`);

console.log("== 5. 快进时间（直接改库，模拟成熟）==");
await prisma.farmPlot.updateMany({
  where: { playerId, plotIndex: 0 },
  data: { readyAt: new Date(Date.now() - 60_000) },
});
check("数据库时间快进成功", true);

console.log("== 6. 收获 ==");
r = await api("/api/farm/harvest", { method: "POST", token, body: { plotIndex: 0 } });
check("收获灵米 ×3，修为 +5", r.status === 200 && r.data.quantity === 3 && r.data.expGained === 5, JSON.stringify(r.data));

r = await api("/api/farm", { token });
check("背包有 3 份灵米", r.data.inventory.some((i) => i.itemId === "spirit_rice" && i.quantity === 3));

console.log("== 7. 出售 ==");
r = await api("/api/shop/sell", { method: "POST", token, body: { itemId: "spirit_rice", quantity: 3 } });
check("入账 45 灵石（3×15）", r.status === 200 && r.data.stonesGained === 45, JSON.stringify(r.data));
check("余额 140（100-5+45）", r.data.stonesLeft === 140, `stonesLeft=${r.data.stonesLeft}`);

console.log("== 8. 建筑升级守卫校验 ==");
r = await api("/api/building/upgrade", { method: "POST", token, body: { type: "farm" } });
check("等级不足被拒（需 8 级）", r.status === 400, `status=${r.status} data=${JSON.stringify(r.data)}`);

console.log("== 9. 季节/越级种植守卫 ==");
r = await api("/api/farm/plant", { method: "POST", token, body: { plotIndex: 1, cropId: "golden_rice" } });
check("越级种植被拒（需 31 级）", r.status === 400, `status=${r.status}`);
r = await api("/api/farm/plant", { method: "POST", token, body: { plotIndex: 1, cropId: "scarlet_fruit" } });
check("朱果 Lv.5 门槛生效", r.status === 400, `status=${r.status}`);

await prisma.$disconnect();

console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
