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
  totalRevenue: number;
  fameLevel: number;
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

export interface EventPendingDto {
  eventId: string;
  title: string;
  text: string;
  options: {
    A: { label: string; description: string };
    B: { label: string; description: string };
  };
  expiresAt: string;
}

export interface HarvestResultDto {
  cropId: string;
  cropName: string;
  quantity: number;
  expGained: number;
  levelUps: number;
  newLevel: number;
  newRealm: string;
  pendingEvent?: EventPendingDto;
}

/** 奇遇结算结果 */
export interface EventResolveResultDto {
  eventId: string;
  option: "A" | "B";
  title: string;
  text: string; // 结果叙述
  effects: Array<{ label: string; value: string }>;
}

// ---------- 境界突破 ----------

export interface BreakthroughMaterialDto {
  itemId: string;
  name: string;
  icon: string;
  need: number;
  have: number;
}

export interface BreakthroughInfoDto {
  available: boolean; // 是否处于可突破的满级状态
  currentRealm: string;
  targetRealm: string;
  stonesCost: number;
  stonesHave: number;
  materials: BreakthroughMaterialDto[];
  baseSuccess: number;
  compensation: number; // 连续失败补偿（+x%）
  successRate: number; // 最终成功率
  fails: number;
  cooldownUntil: string | null;
  maxedOut: boolean; // 已到 90 级飞升上限（飞升转生系统后续实现）
}

export interface BreakthroughResultDto {
  success: boolean;
  fromRealm: string;
  toRealm: string | null;
  expLost: number;
  stonesSpent: number;
  cooldownUntil: string | null;
  message: string;
}

// ---------- 委托任务 ----------

export interface QuestDto {
  id: string;
  key: string;
  name: string;
  type: "plant" | "harvest" | "sell";
  progress: number;
  target: number;
  rewardStones: number;
  rewardExp: number;
  completed: boolean;
  expiresAt: string;
}

export interface QuestClaimResultDto {
  questId: string;
  rewardStones: number;
  rewardExp: number;
  levelUps: number;
  newLevel: number;
}

// ---------- 酒馆顾客与口碑 ----------

export interface TavernOrderDto {
  id: string;
  customerName: string;
  itemId: string;
  itemName: string;
  itemIcon: string;
  quantity: number;
  price: number;
  have: number; // 背包持有量
  expiresAt: string;
}

export interface TavernDto {
  fameLevel: number;
  customersPerHour: number;
  avgSpend: number;
  totalRevenue: number;
  revenueToNext: number | null; // 满级为 null
  orders: TavernOrderDto[];
}

export interface ServeResultDto {
  orderId: string;
  customerName: string;
  itemName: string;
  quantity: number;
  stonesGained: number;
  stonesNow: number;
  totalRevenue: number;
  fameLevel: number;
  levelUps: number;
}

// ---------- 好友与拜访 ----------

export interface FriendDto {
  friendId: string; // Friend 行 id
  playerId: string;
  nickname: string;
  realm: string;
  level: number;
  affinity: number;
}

export interface FriendsDto {
  friends: FriendDto[];
  pendingIn: Array<{ friendId: string; playerId: string; nickname: string }>;
  pendingOut: Array<{ friendId: string; playerId: string; nickname: string }>;
}

export interface VisitPlotDto {
  plotIndex: number;
  cropId: string | null;
  cropName: string | null;
  cropIcon: string | null;
  readyAt: string | null;
  ready: boolean;
  waterCountToday: number;
}

export interface VisitDto {
  playerId: string;
  nickname: string;
  realm: string;
  level: number;
  fameLevel: number;
  farmLevel: number;
  season: string;
  plots: VisitPlotDto[];
}

export interface WaterResultDto {
  plotIndex: number;
  speedupPercent: number;
  newReadyAt: string | null;
  rewardStones: number;
  affinityGained: number;
  waterCountToday: number;
}

// ---------- 野外采集与 PK ----------

export interface WildPlayerDto {
  playerId: string;
  nickname: string;
  realm: string;
  level: number;
  red: boolean; // 是否红名
}

export interface BountyEntryDto {
  playerId: string;
  nickname: string;
  realm: string;
  killScore: number;
  bounty: number; // 悬赏金额
}

export interface WildDto {
  season: string;
  energy: number;
  energyMax: number;
  unlocked: boolean; // 是否已达筑基
  wildPlayers: WildPlayerDto[];
  bounty: BountyEntryDto[];
}

export interface GatherResultDto {
  spotType: "fish" | "mine" | "herb";
  itemId: string;
  itemName: string;
  icon: string;
  exp: number;
  energyLeft: number;
  levelUps: number;
  newLevel: number;
}

export interface LootEntryDto {
  itemId: string;
  name: string;
  icon: string;
  quantity: number;
}

export interface AttackResultDto {
  success: boolean;
  victimWasRed: boolean;
  loot: LootEntryDto[]; // 胜利：抢到的；失败：失去的
  killScoreNow: number;
  bountyReward: number; // 讨伐红名成功领到的悬赏灵石
  message: string;
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
