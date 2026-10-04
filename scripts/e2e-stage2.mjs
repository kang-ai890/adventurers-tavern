/**
 * 阶段 2 端到端测试：注册 / 登录 / 多设备同步 / 游客转正
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage2.mjs
 */

const BASE = process.env.E2E_BASE ?? "http://localhost:4000";

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
const username = `剑客${uniq.slice(-4)}`;
const password = "passw0rd123";

console.log("== 1. 注册新账号 ==");
let r = await api("/api/auth/register", { method: "POST", body: { username, password } });
check("注册成功返回 token", r.status === 200 && !!r.data.token, JSON.stringify(r.data));
check("初始灵石 100 / 等级 1", r.data.player?.stones === 100 && r.data.player?.level === 1);
const playerIdA = r.data.player?.id;
const tokenA = r.data.token;

console.log("== 2. 重复注册被拒 ==");
r = await api("/api/auth/register", { method: "POST", body: { username, password } });
check("返回 409 道号占用", r.status === 409, `status=${r.status}`);

console.log("== 3. 错误密码被拒 ==");
r = await api("/api/auth/login", { method: "POST", body: { username, password: "wrong-password" } });
check("返回 401", r.status === 401, `status=${r.status}`);

console.log("== 4. 登录（模拟另一台设备）==");
r = await api("/api/auth/login", { method: "POST", body: { username, password } });
check("登录成功", r.status === 200 && !!r.data.token);
check("拿到同一份存档（playerId 一致）", r.data.player?.id === playerIdA, `A=${playerIdA} B=${r.data.player?.id}`);
const tokenB = r.data.token;

console.log("== 5. 多设备 token 均可访问 ==");
r = await api("/api/player", { token: tokenA });
check("设备 A token 有效", r.status === 200);
r = await api("/api/player", { token: tokenB });
check("设备 B token 有效", r.status === 200);

console.log("== 6. 游客 → 转正（数据保留）==");
const deviceToken = `e2e-guest-${uniq}`;
r = await api("/api/auth/guest", { method: "POST", body: { deviceToken, nickname: "路人甲" } });
check("游客登录成功", r.status === 200 && !!r.data.token);
const guestPlayerId = r.data.player?.id;
const guestToken = r.data.token;

// 游客先种一株青灵草（花费 3 灵石）
r = await api("/api/farm/plant", { method: "POST", token: guestToken, body: { plotIndex: 0, cropId: "green_spirit_grass" } });
check("游客已种下青灵草", r.status === 200, JSON.stringify(r.data));

// 用同一 deviceToken 注册转正
const regName = `转正者${uniq.slice(-4)}`;
r = await api("/api/auth/register", { method: "POST", body: { username: regName, password, deviceToken } });
check("转正注册成功", r.status === 200, JSON.stringify(r.data));
check("playerId 不变（数据无缝迁移）", r.data.player?.id === guestPlayerId, `${guestPlayerId} vs ${r.data.player?.id}`);
check("灵石保持 97（100-3，未被重置）", r.data.player?.stones === 97, `stones=${r.data.player?.stones}`);

r = await api("/api/farm", { token: r.data.token });
check("灵田里的青灵草还在", r.data.plots?.some((p) => p.cropId === "green_spirit_grass"), JSON.stringify(r.data.plots?.[0]));

console.log("== 7. 转正后设备凭证指向同一账号（不再新建游客）==");
r = await api("/api/auth/guest", { method: "POST", body: { deviceToken, nickname: "路人甲" } });
check("同一 playerId（不会重复建档）", r.status === 200 && r.data.player?.id === guestPlayerId, `id=${r.data.player?.id} vs ${guestPlayerId}`);

console.log("== 8. 转正账号可用账号密码登录 ==");
r = await api("/api/auth/login", { method: "POST", body: { username: regName, password } });
check("登录成功且 playerId 一致", r.status === 200 && r.data.player?.id === guestPlayerId);

console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
