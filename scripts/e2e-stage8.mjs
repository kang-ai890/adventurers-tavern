/**
 * 阶段 8 端到端测试：冒险者 / 招募 / 升级 / 副本自动战斗 / 装备
 * 前置：本地数据库（npm run db:local）+ 后端已启动（npm run dev:server）
 * 用法：node scripts/e2e-stage8.mjs
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

const r0 = await api("/api/auth/guest", { method: "POST", body: { deviceToken: `e2e-s8-${uniq}`, nickname: `历练者${uniq.slice(-4)}` } });
const token = r0.data.token;
const playerId = r0.data.player.id;
await prisma.player.update({ where: { id: playerId }, data: { level: 11, stones: 5_000, energy: 100 } });

console.log("== 1. 新手赠送林惊羽 ==");
let r = await api("/api/heroes", { token });
check("自动获得林惊羽（2星）", r.status === 200 && r.data.heroes.length === 1 && r.data.heroes[0].name === "林惊羽" && r.data.heroes[0].star === 2, JSON.stringify(r.data.heroes?.[0]));
check("战力计算 > 0", r.data.heroes[0].power > 0);

console.log("== 2. 灵石招募 ==");
r = await api("/api/heroes/recruit", { method: "POST", token, body: { currency: "stones" } });
check("招募成功返回新英雄", r.status === 200 && !!r.data.hero?.id && r.data.hero.star >= 2, JSON.stringify(r.data).slice(0, 150));
r = await api("/api/player", { token });
check("扣除 500 灵石", r.data.stones === 4_500, `stones=${r.data.stones}`);
r = await api("/api/heroes", { token });
check("队伍 2 人", r.data.heroes.length === 2);

console.log("== 3. 冒险者升级 ==");
const hero1 = (await api("/api/heroes", { token })).data.heroes[0];
r = await api(`/api/heroes/${hero1.id}/levelup`, { method: "POST", token, body: {} });
check("升级到 Lv.2（花费 50 灵石）", r.status === 200 && r.data.level === 2, JSON.stringify(r.data).slice(0, 120));
check("升级后战力提升", r.data.power > hero1.power, `${hero1.power} -> ${r.data.power}`);

console.log("== 4. 副本列表 ==");
r = await api("/api/dungeons", { token });
check("6 个副本", r.data.length === 6);
check("11 级解锁青竹林小径", r.data[0].unlocked === true && r.data[0].name === "青竹林小径");
check("高阶副本未解锁", r.data[1].unlocked === false);

console.log("== 5. 挑战副本（强制胜利）==");
const heroes = (await api("/api/heroes", { token })).data.heroes.map((h) => h.id);
r = await api("/api/dungeons/battle", { method: "POST", token, body: { dungeonId: "bamboo_path", heroIds: heroes, forceWin: true } });
check("通关成功", r.status === 200 && r.data.success === true, JSON.stringify(r.data).slice(0, 200));
check("修为 +200 / 灵石 +150", r.data.expGained === 200 && r.data.stonesGained === 150);
check("体力 -10", r.data.energyLeft === 90, `energy=${r.data.energyLeft}`);
check("战斗日志有过程", r.data.log.length >= 5, `log lines=${r.data.log?.length}`);

console.log("== 6. 挑战失败（强制）==");
r = await api("/api/dungeons/battle", { method: "POST", token, body: { dungeonId: "bamboo_path", heroIds: heroes, forceLose: true } });
check("失败返回 success=false", r.data.success === false);
check("失败安慰修为 +20（10%）", r.data.expGained === 20, `exp=${r.data.expGained}`);
check("失败无灵石", r.data.stonesGained === 0);

console.log("== 7. 越级挑战被拒 ==");
r = await api("/api/dungeons/battle", { method: "POST", token, body: { dungeonId: "demon_cave", heroIds: heroes, forceWin: true } });
check("天外魔窟需 61 级被拒", r.status === 400, `status=${r.status}`);

console.log("== 8. 装备系统 ==");
// 直接造一件仙品武器
const eq = await prisma.equipment.create({
  data: { playerId, slot: "weapon", quality: "immortal", level: 0, atk: 300, def: 0, hp: 0 },
});
const powerBefore = (await api("/api/heroes", { token })).data.heroes[0].power;
r = await api(`/api/equipment/${eq.id}/equip`, { method: "POST", token, body: { heroId: hero1.id } });
check("装备仙品武器成功", r.status === 200 && r.data.ok === true);
const powerAfter = (await api("/api/heroes", { token })).data.heroes[0].power;
check("装备后战力提升 +300（攻×1 计入战力）", powerAfter === powerBefore + 300, `${powerBefore} -> ${powerAfter}`);
r = await api(`/api/equipment/${eq.id}/unequip`, { method: "POST", token, body: {} });
check("卸下装备", r.status === 200);
const powerBack = (await api("/api/heroes", { token })).data.heroes[0].power;
check("卸下后战力回落", powerBack === powerBefore, `${powerAfter} -> ${powerBack}`);

await prisma.$disconnect();
console.log("");
console.log(`结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
