import type {
  AuthResponseDto,
  BuildingDto,
  FarmStateDto,
  HarvestResultDto,
  PlantResultDto,
  PlayerDto,
  SellResultDto,
  UpgradeResultDto,
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

export type { BuildingDto };
