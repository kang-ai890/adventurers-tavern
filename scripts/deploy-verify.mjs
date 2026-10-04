/**
 * 线上部署验证：对任意 BASE 地址做健康检查 + 游客登录 + 领地读取 + 广场状态冒烟。
 * 用法：node scripts/deploy-verify.mjs <base-url>
 * 例：  node scripts/deploy-verify.mjs https://adventurers-tavern-server.onrender.com
 */
const BASE = (process.argv[2] ?? process.env.E2E_BASE ?? "http://localhost:4000").replace(/\/$/, "");

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

console.log(`🎯 验证目标: ${BASE}`);

console.log("== 1. 健康检查 ==");
let r = await api("/api/health");
check("服务在线", r.status === 200 && r.data.status === "ok", JSON.stringify(r.data));
check("数据库已连接", r.data.db === "ok", `db=${r.data.db}`);

console.log("== 2. 游客登录 ==");
const deviceToken = `verify-${Date.now()}`;
r = await api("/api/auth/guest", { method: "POST", body: { deviceToken, nickname: "验证修士" } });
check("登录成功", r.status === 200 && !!r.data.token, JSON.stringify(r.data));
check("初始灵石 100", r.data.player?.stones === 100);
const token = r.data.token;

console.log("== 3. 领地与酒馆 ==");
r = await api("/api/farm", { token });
check("领地可读取", r.status === 200 && r.data.plotCount >= 4, JSON.stringify(r.data).slice(0, 120));
r = await api("/api/tavern", { token });
check("酒馆可读取", r.status === 200 && typeof r.data.fameLevel === "number");

console.log("== 4. 广场状态 ==");
r = await api("/api/plaza");
check("广场分线状态可读取", r.status === 200 && r.data.capacity === 50, JSON.stringify(r.data));

console.log("");
console.log(`结果：${passed} 通过，${failed} 失败 ${failed > 0 ? "—— 后端未就绪或数据库迁移未执行" : "—— 后端与数据库均已就绪 🎉"}`);
process.exit(failed > 0 ? 1 : 0);
