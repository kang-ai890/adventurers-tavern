/**
 * REST API 响应类型（阶段 1：经营核心）。前后端共享。
 */

export interface PlayerDto {
  id: string;
  nickname: string;
  avatar: string;
  level: number;
  exp: number;
  expToNext: number;
  realm: string;
  stones: number;
  jades: number;
  energy: number;
  fame: number;
}

export interface FarmPlotDto {
  plotIndex: number;
  cropId: string | null;
  cropName: string | null;
  cropIcon: string | null;
  plantedAt: string | null; // ISO
  readyAt: string | null; // ISO
  ready: boolean;
}

export interface InventoryItemDto {
  itemId: string;
  name: string;
  icon: string;
  price: number; // 每份售价（灵石）
  quantity: number;
}

export interface BuildingDto {
  type: string;
  name: string;
  level: number;
  maxLevel: number;
  upgradeCost: number | null; // 升到下一级费用；满级为 null
  upgradeUnlockLevel: number | null; // 升到下一级所需角色等级；满级为 null
  effect: string; // 效果描述
}

export interface FarmStateDto {
  season: string;
  farmLevel: number;
  plotCount: number;
  plots: FarmPlotDto[];
  buildings: BuildingDto[];
  inventory: InventoryItemDto[];
}

export interface AuthResponseDto {
  token: string;
  player: PlayerDto;
}

export interface PlantResultDto {
  plotIndex: number;
  cropId: string;
  cropName: string;
  seedCost: number;
  stonesLeft: number;
  readyAt: string;
}

export interface HarvestResultDto {
  cropId: string;
  cropName: string;
  quantity: number;
  expGained: number;
  levelUps: number;
  newLevel: number;
  newRealm: string;
}

export interface SellResultDto {
  itemId: string;
  quantity: number;
  stonesGained: number;
  stonesLeft: number;
}

export interface UpgradeResultDto {
  type: string;
  newLevel: number;
  cost: number;
  stonesLeft: number;
  newPlotCount: number;
}
