import { prisma } from "@tavern/database";
import {
  DEFAULTS,
  getCrop,
  type PlazaPlayer,
  type StallInfo,
} from "@tavern/shared";

/**
 * 坊市广场：分线内存态（阶段5）。
 * 多实例部署时需迁到 Redis；当前单实例免费方案直接内存。
 */

export interface PlayerSnapshot {
  playerId: string; // 数据库玩家 id
  nickname: string;
  avatar: string;
  level: number;
  realm: string;
  fame: number;
}

interface Line {
  players: Map<string, PlazaPlayer>; // socketId -> player
}

const lines = new Map<number, Line>();

function getLine(line: number): Line {
  if (!lines.has(line)) lines.set(line, { players: new Map() });
  return lines.get(line)!;
}

export interface PlazaStatus {
  capacity: number;
  lines: Array<{ line: number; count: number }>;
}

export function plazaStatus(): PlazaStatus {
  const list = [...lines.entries()]
    .map(([line, l]) => ({ line, count: l.players.size }))
    .sort((a, b) => a.line - b.line);
  if (list.length === 0) list.push({ line: 1, count: 0 });
  return { capacity: DEFAULTS.plazaLineCapacity, lines: list };
}

/** 自动挑人最少的分线（前端调用） */
export function bestLine(): number {
  const status = plazaStatus();
  let best = status.lines[0];
  for (const l of status.lines) if (l.count < best.count) best = l;
  return best.line;
}

export async function joinPlaza(
  line: number,
  socketId: string,
  snapshot: PlayerSnapshot,
): Promise<{ ok: boolean; error?: string; me: PlazaPlayer | null; players: PlazaPlayer[] }> {
  const l = getLine(line);
  if (l.players.size >= DEFAULTS.plazaLineCapacity) {
    return { ok: false, error: "当前分线已满，请稍后再试", me: null, players: [] };
  }
  const me: PlazaPlayer = {
    ...snapshot,
    id: snapshot.playerId,
    socketId,
    x: 200 + Math.floor(Math.random() * 300),
    y: 200 + Math.floor(Math.random() * 300),
    direction: "down",
    stall: null,
  };
  l.players.set(socketId, me);
  return { ok: true, me, players: [...l.players.values()] };
}

export function leavePlaza(socketId: string): { line: number | null } {
  for (const [line, l] of lines) {
    if (l.players.delete(socketId)) return { line };
  }
  return { line: null };
}

export function getPlazaPlayer(socketId: string): PlazaPlayer | null {
  for (const l of lines.values()) {
    const p = l.players.get(socketId);
    if (p) return p;
  }
  return null;
}

export function getLineOf(socketId: string): number | null {
  for (const [line, l] of lines) {
    if (l.players.has(socketId)) return line;
  }
  return null;
}

/** 视野内玩家：距离 ≤ 视野半径（格） */
export function playersInViewOf(line: number, x: number, y: number, excludeSocketId?: string): PlazaPlayer[] {
  const l = getLine(line);
  const range = DEFAULTS.plazaViewRange;
  const result: PlazaPlayer[] = [];
  for (const p of l.players.values()) {
    if (p.socketId === excludeSocketId) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= range * range) result.push(p);
  }
  return result;
}

/** 某玩家的全部在线 socket（用于背包变动后刷新摊位） */
export function socketIdsOfPlayer(playerId: string): string[] {
  const ids: string[] = [];
  for (const l of lines.values()) {
    for (const [socketId, p] of l.players) {
      if (p.id === playerId) ids.push(socketId);
    }
  }
  return ids;
}

export function movePlazaPlayer(socketId: string, x: number, y: number, direction: PlazaPlayer["direction"]): PlazaPlayer | null {
  const p = getPlazaPlayer(socketId);
  if (!p) return null;
  p.x = x;
  p.y = y;
  p.direction = direction;
  return p;
}

/** 开摊：校验背包库存与价格 */
export async function openStall(
  socketId: string,
  input: { title: string; itemId: string; price: number },
): Promise<{ ok: boolean; error?: string; stall: StallInfo | null }> {
  const p = getPlazaPlayer(socketId);
  if (!p) return { ok: false, error: "先进入坊市再摆摊", stall: null };

  const title = input.title.trim().slice(0, 12) || `${p.nickname}的小摊`;
  const price = Math.floor(input.price);
  if (price < 1 || price > 1_000_000) return { ok: false, error: "价格需在 1~100 万灵石之间", stall: null };

  const inv = await prisma.playerInventory.findUnique({
    where: { playerId_itemId: { playerId: p.id, itemId: input.itemId } },
    include: { item: true },
  });
  if (!inv || inv.quantity < 1) return { ok: false, error: "背包里没有这件货", stall: null };

  const stall: StallInfo = {
    title,
    itemId: input.itemId,
    itemName: inv.item.name,
    icon: inv.item.icon,
    price,
    quantity: inv.quantity,
  };
  p.stall = stall;
  return { ok: true, stall };
}

export function closeStall(socketId: string): StallInfo | null {
  const p = getPlazaPlayer(socketId);
  if (!p || !p.stall) return null;
  const stall = p.stall;
  p.stall = null;
  return stall;
}

/** 依据背包变化刷新摊位库存（卖出/收获后调用） */
export async function refreshStallStock(socketId: string): Promise<void> {
  const p = getPlazaPlayer(socketId);
  if (!p?.stall) return;
  const inv = await prisma.playerInventory.findUnique({
    where: { playerId_itemId: { playerId: p.id, itemId: p.stall.itemId } },
  });
  if (!inv || inv.quantity < 1) {
    p.stall = null;
    return;
  }
  p.stall.quantity = inv.quantity;
  const crop = getCrop(inv.itemId);
  if (crop) {
    p.stall.itemName = crop.name;
    p.stall.icon = crop.icon;
  }
}
