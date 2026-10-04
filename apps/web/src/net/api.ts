import type {
  AttackResultDto,
  AuthResponseDto,
  BreakthroughInfoDto,
  BreakthroughResultDto,
  BuildingDto,
  EventResolveResultDto,
  FarmStateDto,
  FriendsDto,
  GatherResultDto,
  HarvestResultDto,
  PlantResultDto,
  PlayerDto,
  QuestClaimResultDto,
  QuestDto,
  SellResultDto,
  ServeResultDto,
  TavernDto,
  UpgradeResultDto,
  VisitDto,
  WaterResultDto,
  WildDto,
} from "@tavern/shared";

const API_BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? window.location.origin;

let token: string | null = localStorage.getItem("tavern.token");

export function getToken(): string | null {
  return token;
}

function setToken(t: string) {
  token = t;
  localStorage.setItem("tavern.token", t);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------- 认证 ----------

export async function apiGuestLogin(deviceToken: string, nickname?: string): Promise<AuthResponseDto> {
  const result = await api<AuthResponseDto>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify({ deviceToken, nickname }),
  });
  setToken(result.token);
  return result;
}

/** 注册：携带 deviceToken 时自动执行游客转正（数据保留） */
export async function apiRegister(
  username: string,
  password: string,
  deviceToken?: string,
): Promise<AuthResponseDto> {
  const result = await api<AuthResponseDto>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, deviceToken }),
  });
  setToken(result.token);
  return result;
}

export async function apiLogin(username: string, password: string): Promise<AuthResponseDto> {
  const result = await api<AuthResponseDto>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(result.token);
  return result;
}

export function apiLogout() {
  token = null;
  localStorage.removeItem("tavern.token");
}

// ---------- 查询 ----------

export function apiGetPlayer(): Promise<PlayerDto> {
  return api<PlayerDto>("/api/player");
}

export function apiGetFarm(): Promise<FarmStateDto> {
  return api<FarmStateDto>("/api/farm");
}

// ---------- 操作 ----------

export function apiPlant(plotIndex: number, cropId: string): Promise<PlantResultDto> {
  return api<PlantResultDto>("/api/farm/plant", {
    method: "POST",
    body: JSON.stringify({ plotIndex, cropId }),
  });
}

export function apiHarvest(plotIndex: number): Promise<HarvestResultDto> {
  return api<HarvestResultDto>("/api/farm/harvest", {
    method: "POST",
    body: JSON.stringify({ plotIndex }),
  });
}

export function apiSell(itemId: string, quantity: number): Promise<SellResultDto> {
  return api<SellResultDto>("/api/shop/sell", {
    method: "POST",
    body: JSON.stringify({ itemId, quantity }),
  });
}

export function apiUpgradeFarm(): Promise<UpgradeResultDto> {
  return api<UpgradeResultDto>("/api/building/upgrade", {
    method: "POST",
    body: JSON.stringify({ type: "farm" }),
  });
}

// ---------- 境界突破 ----------

export function apiBreakthroughInfo(): Promise<BreakthroughInfoDto> {
  return api<BreakthroughInfoDto>("/api/breakthrough");
}

export function apiBreakthrough(): Promise<BreakthroughResultDto> {
  return api<BreakthroughResultDto>("/api/breakthrough", { method: "POST", body: "{}" });
}

// ---------- 委托任务 ----------

export function apiQuests(): Promise<QuestDto[]> {
  return api<QuestDto[]>("/api/quests");
}

export function apiClaimQuest(questId: string): Promise<QuestClaimResultDto> {
  return api<QuestClaimResultDto>(`/api/quests/${questId}/claim`, { method: "POST", body: "{}" });
}

// ---------- 奇遇事件 ----------

export function apiResolveEvent(eventId: string, option: "A" | "B"): Promise<EventResolveResultDto> {
  return api<EventResolveResultDto>("/api/event/resolve", {
    method: "POST",
    body: JSON.stringify({ eventId, option }),
  });
}

// ---------- 酒馆顾客 ----------

export function apiTavern(): Promise<TavernDto> {
  return api<TavernDto>("/api/tavern");
}

export function apiServeOrder(orderId: string): Promise<ServeResultDto> {
  return api<ServeResultDto>("/api/tavern/serve", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
}

// ---------- 好友与拜访 ----------

export function apiFriends(): Promise<FriendsDto> {
  return api<FriendsDto>("/api/friends");
}

export function apiFriendRequest(ref: string): Promise<{ friendId: string }> {
  return api<{ friendId: string }>("/api/friends/request", {
    method: "POST",
    body: JSON.stringify({ ref }),
  });
}

export function apiFriendAccept(friendId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/friends/accept", {
    method: "POST",
    body: JSON.stringify({ friendId }),
  });
}

export function apiFriendRemove(friendId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/friends/remove", {
    method: "POST",
    body: JSON.stringify({ friendId }),
  });
}

export function apiVisit(playerId: string): Promise<VisitDto> {
  return api<VisitDto>(`/api/visit/${playerId}`);
}

export function apiWater(playerId: string, plotIndex: number): Promise<WaterResultDto> {
  return api<WaterResultDto>(`/api/visit/${playerId}/water`, {
    method: "POST",
    body: JSON.stringify({ plotIndex }),
  });
}

// ---------- 野外 ----------

export function apiWild(): Promise<WildDto> {
  return api<WildDto>("/api/wild");
}

export function apiWildEnter(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/wild/enter", { method: "POST", body: "{}" });
}

export function apiWildLeave(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/wild/leave", { method: "POST", body: "{}" });
}

export function apiWildGather(spotType: "fish" | "mine" | "herb"): Promise<GatherResultDto> {
  return api<GatherResultDto>("/api/wild/gather", {
    method: "POST",
    body: JSON.stringify({ spotType }),
  });
}

export function apiWildAttack(targetPlayerId: string): Promise<AttackResultDto> {
  return api<AttackResultDto>("/api/wild/attack", {
    method: "POST",
    body: JSON.stringify({ targetPlayerId }),
  });
}

export type { BuildingDto };
