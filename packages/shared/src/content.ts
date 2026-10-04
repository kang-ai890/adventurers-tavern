/**
 * 游戏内容数据（与 docs/游戏数值设计.md 第 1、2 章保持一致）。
 * 前后端共享：服务端用于校验与结算，前端用于展示。
 */

import { REALMS } from "./config.js";

export interface CropDef {
  id: string;
  name: string;
  icon: string;
  growMinutes: number;
  seedCost: number;
  yieldCount: number;
  sellPrice: number; // 每份售价（灵石）
  exp: number; // 收获经验/株
  seasons: string[]; // 可种植季节（"四季" = 全年）
  unlockLevel: number; // 解锁等级
}

/** 常规作物 13 种（数值设计 §2.1） */
export const CROPS: CropDef[] = [
  { id: "spirit_rice", name: "灵米", icon: "🌾", growMinutes: 10, seedCost: 5, yieldCount: 3, sellPrice: 15, exp: 5, seasons: ["四季"], unlockLevel: 1 },
  { id: "green_spirit_grass", name: "青灵草", icon: "🌿", growMinutes: 8, seedCost: 3, yieldCount: 2, sellPrice: 8, exp: 3, seasons: ["四季"], unlockLevel: 1 },
  { id: "scarlet_fruit", name: "朱果", icon: "🍒", growMinutes: 30, seedCost: 15, yieldCount: 3, sellPrice: 50, exp: 12, seasons: ["春", "夏"], unlockLevel: 5 },
  { id: "snow_lotus", name: "雪莲", icon: "❄️", growMinutes: 45, seedCost: 25, yieldCount: 2, sellPrice: 90, exp: 15, seasons: ["冬"], unlockLevel: 8 },
  { id: "mist_tea", name: "灵雾茶", icon: "🍵", growMinutes: 20, seedCost: 10, yieldCount: 2, sellPrice: 35, exp: 8, seasons: ["春", "秋"], unlockLevel: 11 },
  { id: "black_ginseng", name: "玄参", icon: "🪵", growMinutes: 60, seedCost: 40, yieldCount: 2, sellPrice: 150, exp: 25, seasons: ["秋"], unlockLevel: 13 },
  { id: "purple_lingzhi", name: "紫纹灵芝", icon: "🍄", growMinutes: 120, seedCost: 80, yieldCount: 2, sellPrice: 320, exp: 40, seasons: ["夏", "秋"], unlockLevel: 18 },
  { id: "flame_pepper", name: "火灵椒", icon: "🌶️", growMinutes: 25, seedCost: 18, yieldCount: 3, sellPrice: 60, exp: 15, seasons: ["夏"], unlockLevel: 21 },
  { id: "ice_soul_fruit", name: "冰魄果", icon: "🧊", growMinutes: 180, seedCost: 120, yieldCount: 2, sellPrice: 500, exp: 60, seasons: ["冬"], unlockLevel: 23 },
  { id: "golden_rice", name: "金线稻", icon: "🌟", growMinutes: 360, seedCost: 200, yieldCount: 3, sellPrice: 900, exp: 120, seasons: ["秋"], unlockLevel: 31 },
  { id: "blood_bodhi", name: "血菩提", icon: "🍇", growMinutes: 480, seedCost: 300, yieldCount: 2, sellPrice: 1500, exp: 150, seasons: ["春", "夏"], unlockLevel: 33 },
  { id: "illusion_flower", name: "幻心花", icon: "🌸", growMinutes: 720, seedCost: 500, yieldCount: 2, sellPrice: 2400, exp: 220, seasons: ["春"], unlockLevel: 41 },
  { id: "thunderwood_sprout", name: "雷击木苗", icon: "⚡", growMinutes: 1440, seedCost: 800, yieldCount: 2, sellPrice: 4500, exp: 350, seasons: ["夏"], unlockLevel: 43 },
];

export function getCrop(id: string): CropDef | undefined {
  return CROPS.find((c) => c.id === id);
}

/** 灵田建筑（数值设计 §2.4）：等级 → 地块数 / 升级费用 / 解锁等级 */
export const FARM_BUILDING = {
  maxLevel: 7,
  plotsByLevel: [4, 6, 8, 10, 12, 14, 16] as const, // index 0 = 1 级
  upgradeCosts: [0, 500, 2_000, 8_000, 30_000, 100_000, 400_000] as const, // 升到该级费用
  unlockLevels: [1, 8, 11, 21, 31, 41, 51] as const,
};

/** 境界（数值设计 §1.1）：每境界 10 级，层需求 = round(首层需求 × 1.08^(k-1)) */
export const REALM_FIRST_EXP = [150, 400, 1_000, 2_400, 5_500, 12_000, 26_000, 56_000, 120_000] as const;

export function realmOfLevel(level: number): string {
  const idx = Math.min(Math.floor((level - 1) / 10), REALMS.length - 1);
  return REALMS[idx];
}

/** 从 level 升到 level+1 所需修为 */
export function expToNext(level: number): number {
  const idx = Math.min(Math.floor((level - 1) / 10), REALM_FIRST_EXP.length - 1);
  const k = ((level - 1) % 10) + 1;
  return Math.round(REALM_FIRST_EXP[idx] * Math.pow(1.08, k - 1));
}

/** 当前季节：按月份划分（3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬） */
export function currentSeason(now: Date = new Date()): string {
  const m = now.getMonth() + 1;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

export function cropCanPlantInSeason(crop: CropDef, season: string): boolean {
  return crop.seasons.includes("四季") || crop.seasons.includes(season);
}

/** 新玩家初始灵石 */
export const STARTING_STONES = 100;

// ============================================================
// 境界突破（数值设计 §1.2，简化版）
// 说明：丹药（筑基丹/结金丹/破境丹）与星辰砂/龙须鱼/雷击木等来自炼丹/野外系统的材料，
// 在对应系统（阶段5/6）实现前，暂以灵石+可种植作物替代，后续阶段补全。
// ============================================================

export interface BreakthroughRequirement {
  targetLevel: number; // 当前境界满级（10 的倍数）
  realm: string; // 突破后进入的境界
  stonesCost: number;
  materials: Array<{ itemId: string; count: number }>;
  baseSuccess: number; // 基础成功率
  cooldownHours: number; // 失败冷却
}

export const BREAKTHROUGHS: Record<number, BreakthroughRequirement> = {
  10: { targetLevel: 10, realm: "筑基", stonesCost: 500, materials: [], baseSuccess: 1.0, cooldownHours: 0 },
  20: { targetLevel: 20, realm: "金丹", stonesCost: 2_000, materials: [{ itemId: "purple_lingzhi", count: 5 }], baseSuccess: 0.8, cooldownHours: 24 },
  30: { targetLevel: 30, realm: "元婴", stonesCost: 8_000, materials: [{ itemId: "ice_soul_fruit", count: 8 }], baseSuccess: 0.7, cooldownHours: 24 },
  40: { targetLevel: 40, realm: "化神", stonesCost: 20_000, materials: [{ itemId: "blood_bodhi", count: 8 }], baseSuccess: 0.6, cooldownHours: 24 },
  50: { targetLevel: 50, realm: "炼虚", stonesCost: 50_000, materials: [{ itemId: "illusion_flower", count: 6 }], baseSuccess: 0.5, cooldownHours: 24 },
  60: { targetLevel: 60, realm: "合体", stonesCost: 120_000, materials: [{ itemId: "illusion_flower", count: 10 }], baseSuccess: 0.45, cooldownHours: 24 },
  70: { targetLevel: 70, realm: "大乘", stonesCost: 300_000, materials: [{ itemId: "blood_bodhi", count: 15 }], baseSuccess: 0.4, cooldownHours: 24 },
  80: { targetLevel: 80, realm: "渡劫", stonesCost: 800_000, materials: [{ itemId: "illusion_flower", count: 20 }], baseSuccess: 0.35, cooldownHours: 24 },
};

/** 突破补偿：每连续失败 1 次 +5%，上限 +20% */
export const BREAKTHROUGH_COMPENSATION_PER_FAIL = 0.05;
export const BREAKTHROUGH_COMPENSATION_CAP = 0.2;
export const MAX_PLAYER_LEVEL = 90;

/** 是否为境界满级（10 的倍数）：满级时修为封顶，需突破才能继续升级 */
export function isRealmCapLevel(level: number): boolean {
  return level % 10 === 0 && level < MAX_PLAYER_LEVEL;
}

// ============================================================
// 委托任务板（每天自动生成 3 个）
// ============================================================

export interface QuestDef {
  key: string;
  name: string;
  type: "plant" | "harvest" | "sell";
  targetCount: number;
  rewardStones: number;
  rewardExp: number;
  durationHours: number;
}

export const QUEST_DEFS: QuestDef[] = [
  { key: "plant_3", name: "开垦播种", type: "plant", targetCount: 3, rewardStones: 60, rewardExp: 40, durationHours: 24 },
  { key: "plant_5", name: "广种灵田", type: "plant", targetCount: 5, rewardStones: 120, rewardExp: 70, durationHours: 24 },
  { key: "harvest_3", name: "丰收之喜", type: "harvest", targetCount: 3, rewardStones: 80, rewardExp: 50, durationHours: 24 },
  { key: "harvest_5", name: "五谷丰登", type: "harvest", targetCount: 5, rewardStones: 150, rewardExp: 90, durationHours: 24 },
  { key: "sell_5", name: "坊市走货", type: "sell", targetCount: 5, rewardStones: 100, rewardExp: 60, durationHours: 24 },
  { key: "sell_10", name: "大商之道", type: "sell", targetCount: 10, rewardStones: 220, rewardExp: 110, durationHours: 24 },
];

export const DAILY_QUEST_COUNT = 3;

// ============================================================
// 随机奇遇事件（数值设计 §10，12 个）
// 说明：文档设定为"每 2 小时判定 30% + 保底"；阶段 3 简化为"每次收获 18% 触发"，
// 即时反馈更强，定时器版本留待运营系统阶段实现。
// ============================================================

export interface EventOptionText {
  label: string; // 按钮文案
  description: string; // 选项说明（含风险提示）
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  weight: number;
  options: { A: EventOptionText; B: EventOptionText };
}

export const EVENT_DEFS: EventDef[] = [
  {
    id: "pest_plague", title: "灵田虫灾", weight: 100,
    text: "灵田里突然爬满金纹虫，正在啃食灵植！",
    options: {
      A: { label: "撒药灭虫", description: "花费 100 灵石，作物无损" },
      B: { label: "放任不管", description: "30% 概率本次减产 50%；70% 概率引来益鸟，口碑 +30" },
    },
  },
  {
    id: "elder_visit", title: "仙门长老光顾", weight: 80,
    text: "一位鹤发童颜的仙门长老步入酒馆，众人纷纷行礼。",
    options: {
      A: { label: "以礼相待", description: "口碑 +50" },
      B: { label: "献上最贵菜品", description: "消耗 1 份最贵物品：口碑 +150，得长老手信（灵石 +800）" },
    },
  },
  {
    id: "meteor_fall", title: "天降陨石", weight: 50,
    text: "夜空中一道火光坠入后山，砸出一个深坑！",
    options: {
      A: { label: "上报官府", description: "灵石 +200，口碑 +10" },
      B: { label: "私自熔炼", description: "50% 得陨铁（灵石 +1,500）；50% 炉子受损（灵石 -300）" },
    },
  },
  {
    id: "lost_cultivator", title: "迷路修士求助", weight: 120,
    text: "一名神色慌张的年轻修士向你打听去灵剑宗的路。",
    options: {
      A: { label: "为他指路", description: "灵石 +50，口碑 +15" },
      B: { label: "留宿一宿", description: "花费 100 灵石，次日得回报（灵石 +160）" },
    },
  },
  {
    id: "spirit_spring", title: "灵泉喷涌", weight: 60,
    text: "后院突然喷出一股灵泉，泉水清澈灵气逼人！",
    options: {
      A: { label: "取水售卖", description: "灵石 +300" },
      B: { label: "引入灵田", description: "所有生长中的作物剩余时间 -30%" },
    },
  },
  {
    id: "drunk_immortal", title: "醉仙闹事", weight: 90,
    text: "一位醉醺醺的老仙在店里摔碗砸坛，客人纷纷侧目。",
    options: {
      A: { label: "好言相劝", description: "口碑 +20" },
      B: { label: "陪他喝三碗", description: "花费 150 灵石；50% 得醉仙方（灵石 +2,000），50% 吓跑顾客（口碑 -30）" },
    },
  },
  {
    id: "fox_gratitude", title: "狐狸精报恩", weight: 40,
    text: "一只白狐叼着锦囊放在你门前，眼中似有灵性。",
    options: {
      A: { label: "婉言谢绝", description: "无事发生（稳字当头）" },
      B: { label: "收下谢礼", description: "灵石 +500；10% 概率她其实是来踩点的（口碑 -15）" },
    },
  },
  {
    id: "thunder_temper", title: "雷电淬炼", weight: 45,
    text: "乌云压顶，一道雷柱直直劈向你的酒馆！",
    options: {
      A: { label: "关门避雷", description: "无事发生" },
      B: { label: "引雷淬炼", description: "50% 修为 +60；50% 器物受损（灵石 -100）" },
    },
  },
  {
    id: "peddler_pass", title: "行脚商路过", weight: 110,
    text: "挑担的行脚商神秘兮兮地展开一卷泛黄的残卷。",
    options: {
      A: { label: "买下残卷", description: "花费 800 灵石，参悟得修为 +300" },
      B: { label: "不买", description: "无事发生" },
    },
  },
  {
    id: "beggar_alms", title: "乞丐化缘", weight: 100,
    text: "一名衣衫褴褛的乞丐捧着破碗，坐在酒馆台阶上。",
    options: {
      A: { label: "施舍 10 灵石", description: "口碑 +10" },
      B: { label: "收留打杂", description: "花费 200 灵石，他传授些江湖门道（修为 +80）" },
    },
  },
  {
    id: "beast_escape", title: "灵兽跑丢", weight: 85,
    text: "栏里的灵兽不知被什么惊了，破栏而出跑向后山！",
    options: {
      A: { label: "发动村民找", description: "花费 100 灵石，灵兽找回" },
      B: { label: "亲自追到野外", description: "经历一场追逐（修为 +50）" },
    },
  },
  {
    id: "matchmaker", title: "月老牵线", weight: 40,
    text: "一位手持红线的老者笑呵呵地看着你：'小友，缘分到了。'",
    options: {
      A: { label: "婉言谢绝", description: "无事发生" },
      B: { label: "结下良缘", description: "得一段机缘（修为 +30，缘分印记 +1）" },
    },
  },
];

export function getEvent(id: string): EventDef | undefined {
  return EVENT_DEFS.find((e) => e.id === id);
}

/** 奇遇触发概率（每次收获） */
export const EVENT_TRIGGER_CHANCE = 0.18;

// ============================================================
// 顾客与口碑（数值设计 §16.1）
// ============================================================

/** 升级到下一口碑等级所需的累计营业额（灵石，按序累计） */
export const FAME_THRESHOLDS = [
  500, 1_500, 4_000, 10_000, 25_000, 60_000, 120_000, 250_000, 500_000, 1_000_000, 2_000_000,
] as const;

/** 各口碑等级（0~10）的客流（人/小时）与客单价（灵石） */
export const FAME_CUSTOMERS_PER_HOUR = [6, 8, 10, 12, 15, 18, 22, 26, 30, 36, 45] as const;
export const FAME_AVG_SPEND = [20, 30, 45, 60, 80, 100, 130, 160, 200, 250, 320] as const;

export function fameLevelOf(totalRevenue: number): number {
  let level = 0;
  for (const t of FAME_THRESHOLDS) {
    if (totalRevenue >= t) level++;
    else break;
  }
  return level;
}

/** 顾客点单数量：客单价 / 菜品单价，限制 1~9 份 */
export function customerOrderQuantity(avgSpend: number, sellPrice: number): number {
  return Math.max(1, Math.min(9, Math.round(avgSpend / sellPrice)));
}

/** NPC 顾客名池（修仙味） */
export const NPC_NAMES = [
  "赶路的剑修", "采药的老翁", "游方的僧人", "佩刀的女侠", "醉醺醺的老道",
  "风尘仆仆的镖师", "卖唱的小童", "扫地的杂役", "过路的商贾", "避雨的猎户",
  "进香的香客", "寻人的书生", "挑柴的樵夫", "撑伞的姑娘", "牵马的马夫",
] as const;

/** 酒馆订单：未招待的订单超时（分钟） */
export const TAVERN_ORDER_TTL_MINUTES = 60;
/** 同时最多挂着的订单数 */
export const TAVERN_MAX_PENDING_ORDERS = 12;

// ============================================================
// 好友与浇水（数值设计 §2.3）
// ============================================================

/** 每次浇水加速：剩余时间 -5% */
export const WATER_SPEEDUP = 0.05;
/** 单块地每日可被浇水次数 */
export const WATER_MAX_PER_PLOT_PER_DAY = 5;
/** 浇水者奖励（灵石） */
export const WATERER_REWARD_STONES = 10;
/** 浇水者好感度收益 */
export const WATERER_AFFINITY_GAIN = 2;

// ============================================================
// 野外采集（数值设计 §6）
// ============================================================

export interface GatherItem {
  itemId: string;
  name: string;
  icon: string;
  weight: number; // 概率权重
  exp: number;
  sellPrice: number;
}

export type GatherSpotType = "fish" | "mine" | "herb";

export const GATHER_TABLES: Record<GatherSpotType, { label: string; icon: string; items: GatherItem[] }> = {
  fish: {
    label: "钓鱼",
    icon: "🎣",
    items: [
      { itemId: "blue_carp", name: "青鱼", icon: "🐟", weight: 60, exp: 10, sellPrice: 15 },
      { itemId: "spirit_carp", name: "灵鲤", icon: "🐠", weight: 30, exp: 15, sellPrice: 40 },
      { itemId: "golden_fish", name: "金背灵鱼", icon: "🐡", weight: 8, exp: 30, sellPrice: 150 },
      { itemId: "dragon_fish", name: "龙须鱼", icon: "🐲", weight: 2, exp: 60, sellPrice: 800 },
    ],
  },
  mine: {
    label: "挖矿",
    icon: "⛏️",
    items: [
      { itemId: "iron_ore", name: "铁矿石", icon: "🪨", weight: 60, exp: 10, sellPrice: 20 },
      { itemId: "copper_ore", name: "铜精矿", icon: "🔶", weight: 30, exp: 20, sellPrice: 50 },
      { itemId: "black_iron", name: "玄铁精", icon: "⚙️", weight: 8, exp: 40, sellPrice: 200 },
      { itemId: "star_sand", name: "星辰砂", icon: "✨", weight: 2, exp: 80, sellPrice: 1_000 },
    ],
  },
  herb: {
    label: "采药",
    icon: "🌿",
    items: [
      { itemId: "hemostasis_herb", name: "止血草", icon: "🌱", weight: 60, exp: 10, sellPrice: 12 },
      { itemId: "mist_grass", name: "灵雾草", icon: "🍃", weight: 30, exp: 15, sellPrice: 45 },
      { itemId: "century_knotweed", name: "百年何首乌", icon: "🥔", weight: 8, exp: 35, sellPrice: 180 },
      { itemId: "millennium_lingzhi", name: "千年灵芝", icon: "🍄", weight: 2, exp: 70, sellPrice: 900 },
    ],
  },
};

/** 采集体力消耗（1 点/次） */
export const GATHER_ENERGY_COST = 1;
export const ENERGY_MAX = 100;
export const ENERGY_REGEN_MINUTES = 5; // 5 分钟回 1 点

const gatherItemIds = new Set(
  Object.values(GATHER_TABLES).flatMap((t) => t.items.map((i) => i.itemId)),
);

/** 是否为野外采集物（PK 抢夺只针对这类物品） */
export function isGatherItem(itemId: string): boolean {
  return gatherItemIds.has(itemId);
}

// ============================================================
// 野外 PK 与红名（数值设计 §11）
// ============================================================

export const PK_REQUIRE_LEVEL = 11; // 筑基及以上可入野外/被袭击
export const PK_KILL_SCORE_PER_ATTACK = 100; // 主动袭击杀孽 +100/次
export const PK_LOOT_BASE_RATIO = 0.15; // 抢夺基础比例
export const PK_LOOT_REALM_STEP = 0.05; // 受害者每高 1 大境界 +5%
export const PK_LOOT_MAX = 0.3;
export const PK_LOOT_MIN = 0.1;
export const PK_DEFEAT_LOOT_RATIO = 0.1; // 袭击失败掉 10% 采集物给对方
export const PK_SAME_TARGET_COOLDOWN_MINUTES = 30;
export const PK_SAME_TARGET_DAILY_LIMIT = 5;
export const PK_MAX_ATTACKS_PER_DAY = 10;
export const RED_NAME_DECAY_PER_HOUR = 1; // 杀孽 -1/小时
export const BOUNTY_KILL_SCORE_REDUCTION = 50; // 红名被讨伐杀孽 -50
export const BOUNTY_BASE_MULTIPLIER = 20; // 悬赏 = 杀孽 × 20 × (1 + 0.2 × 境界序号)
export const BOUNTY_REALM_MULTIPLIER = 0.2;
export const KILL_SCORE_MAX = 5_000;

/** 境界序号：炼气 0 ~ 渡劫 8 */
export function realmIndex(realm: string): number {
  const idx = REALMS.indexOf(realm as (typeof REALMS)[number]);
  return idx < 0 ? 0 : idx;
}

/** 悬赏金额公式（数值设计 §11.2） */
export function bountyOf(killScore: number, realm: string): number {
  return Math.floor(killScore * BOUNTY_BASE_MULTIPLIER * (1 + BOUNTY_REALM_MULTIPLIER * realmIndex(realm)));
}

// ============================================================
// 每日签到与寻宝罗盘
// ============================================================

/** 签到 7 天一轮（第 7 天大奖：仙玉） */
export const CHECKIN_CYCLE = [
  { day: 1, stones: 50, jades: 0 },
  { day: 2, stones: 60, jades: 0 },
  { day: 3, stones: 80, jades: 0 },
  { day: 4, stones: 100, jades: 0 },
  { day: 5, stones: 120, jades: 0 },
  { day: 6, stones: 150, jades: 0 },
  { day: 7, stones: 200, jades: 3 },
] as const;

/** 寻宝罗盘：每日免费 3 次 */
export const TREASURE_DAILY_LIMIT = 3;

export const TREASURE_POOL = [
  { type: "stones", weight: 40, min: 20, max: 100 },
  { type: "crop", weight: 30 },
  { type: "material", weight: 20 },
  { type: "jades", weight: 10, count: 1 },
] as const;

// ============================================================
// 冒险者（英雄，数值设计 §8）
// ============================================================

export interface HeroDef {
  id: string;
  name: string;
  icon: string;
  job: string;
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

export const HERO_DEFS: HeroDef[] = [
  { id: "lin_jingyu", name: "林惊羽", icon: "⚔️", job: "剑修·物理输出", atk: 120, def: 60, hp: 800, spd: 100 },
  { id: "tie_yan", name: "铁岩", icon: "🛡️", job: "体修·坦克", atk: 80, def: 120, hp: 1_600, spd: 60 },
  { id: "su_yao", name: "苏瑶", icon: "🧪", job: "丹师·治疗", atk: 70, def: 70, hp: 900, spd: 80 },
  { id: "bai_wuxia", name: "白无瑕", icon: "🔮", job: "阵师·控制", atk: 90, def: 100, hp: 1_000, spd: 70 },
  { id: "a_bao", name: "阿宝", icon: "🐾", job: "御兽师·召唤", atk: 100, def: 80, hp: 950, spd: 85 },
  { id: "mo_qianji", name: "墨千机", icon: "📜", job: "符师·群攻", atk: 130, def: 50, hp: 700, spd: 95 },
  { id: "liu_ruyin", name: "柳如音", icon: "🎵", job: "音修·辅助", atk: 60, def: 90, hp: 850, spd: 110 },
  { id: "luo_tianlei", name: "洛天雷", icon: "🔨", job: "器修·爆发", atk: 140, def: 55, hp: 750, spd: 90 },
];

export function getHeroDef(id: string): HeroDef | undefined {
  return HERO_DEFS.find((h) => h.id === id);
}

/** 每级成长：攻+8 防+4 血+80 速+1 */
export const HERO_GROWTH = { atk: 8, def: 4, hp: 80, spd: 1 } as const;
export const HERO_MAX_STAR = 5;

/** 星级属性倍率：1 + 0.3 × (星-1) */
export function starMultiplier(star: number): number {
  return 1 + 0.3 * (star - 1);
}

/** 英雄战力 = 攻 + 防×0.5 + 血×0.06 */
export function heroPower(atk: number, def: number, hp: number): number {
  return Math.round(atk + def * 0.5 + hp * 0.06);
}

export const RECRUIT_STONES_COST = 500; // 灵石招募令
export const RECRUIT_JADES_COST = 50; // 仙玉招募
/** 灵石招募：2星80% / 3星18% / 4星2% */
export const RECRUIT_STONES_POOL = [
  { star: 2, weight: 80 },
  { star: 3, weight: 18 },
  { star: 4, weight: 2 },
] as const;
/** 仙玉招募：3星50% / 4星40% / 5星10% */
export const RECRUIT_JADES_POOL = [
  { star: 3, weight: 50 },
  { star: 4, weight: 40 },
  { star: 5, weight: 10 },
] as const;

/** 英雄升级费用：等级 × 50 灵石 */
export function heroLevelUpCost(level: number): number {
  return level * 50;
}

// ============================================================
// 装备（数值设计 §7.1 品质表）
// ============================================================

export type EquipmentQuality = "mortal" | "fine" | "superior" | "epic" | "immortal";

export const EQUIPMENT_QUALITIES: Record<
  EquipmentQuality,
  { label: string; color: string; multiplier: number; maxLevel: number }
> = {
  mortal: { label: "凡品", color: "#d8d8d8", multiplier: 1.0, maxLevel: 5 },
  fine: { label: "良品", color: "#6fcf97", multiplier: 1.3, maxLevel: 10 },
  superior: { label: "上品", color: "#6fc3df", multiplier: 1.7, maxLevel: 15 },
  epic: { label: "极品", color: "#b18cff", multiplier: 2.2, maxLevel: 20 },
  immortal: { label: "仙品", color: "#ffd166", multiplier: 3.0, maxLevel: 25 },
};

export type EquipmentSlot = "weapon" | "armor" | "accessory";

/** 部位模板（凡品基准：武器攻100 / 衣袍防60 / 饰品血300） */
export const EQUIPMENT_SLOTS: Record<EquipmentSlot, { label: string; atk: number; def: number; hp: number }> = {
  weapon: { label: "武器", atk: 100, def: 0, hp: 0 },
  armor: { label: "衣袍", atk: 0, def: 60, hp: 0 },
  accessory: { label: "饰品", atk: 0, def: 0, hp: 300 },
};

/** 装备属性 = 部位模板 × 品质倍率 × (1 + 0.05 × 强化等级) */
export function equipmentStats(slot: EquipmentSlot, quality: EquipmentQuality, level: number) {
  const tpl = EQUIPMENT_SLOTS[slot];
  const q = EQUIPMENT_QUALITIES[quality];
  const enhance = 1 + 0.05 * level;
  return {
    atk: Math.round(tpl.atk * q.multiplier * enhance),
    def: Math.round(tpl.def * q.multiplier * enhance),
    hp: Math.round(tpl.hp * q.multiplier * enhance),
  };
}

// ============================================================
// 副本（数值设计 §9）
// ============================================================

export interface DungeonDef {
  id: string;
  name: string;
  icon: string;
  unlockLevel: number; // 解锁境界对应等级
  recommendedPower: number;
  energyCost: number;
  expReward: number;
  stonesReward: number;
  /** 材料掉落池（按权重） */
  materialPool: Array<{ itemId: string; weight: number; count: number }>;
  /** 装备掉落：概率与品质池 */
  equipChance: number;
  equipQualityPool: Array<{ quality: EquipmentQuality; weight: number }>;
  /** 稀有碎片（图纸等） */
  fragmentChance: number;
  fragmentItemId: string;
}

export const DUNGEONS: DungeonDef[] = [
  {
    id: "bamboo_path", name: "青竹林小径", icon: "🎋", unlockLevel: 11, recommendedPower: 500,
    energyCost: 10, expReward: 200, stonesReward: 150,
    materialPool: [
      { itemId: "black_ginseng", weight: 30, count: 1 },
      { itemId: "copper_ore", weight: 25, count: 1 },
      { itemId: "green_spirit_grass", weight: 20, count: 2 },
    ],
    equipChance: 0.2,
    equipQualityPool: [
      { quality: "fine", weight: 80 },
      { quality: "superior", weight: 20 },
    ],
    fragmentChance: 0.05,
    fragmentItemId: "bamboo_talisman",
  },
  {
    id: "blackwind_mine", name: "黑风矿洞", icon: "⛰️", unlockLevel: 21, recommendedPower: 3_000,
    energyCost: 12, expReward: 500, stonesReward: 300,
    materialPool: [
      { itemId: "purple_lingzhi", weight: 25, count: 1 },
      { itemId: "black_iron", weight: 20, count: 1 },
      { itemId: "star_sand", weight: 15, count: 1 },
      { itemId: "iron_ore", weight: 30, count: 2 },
    ],
    equipChance: 0.18,
    equipQualityPool: [
      { quality: "fine", weight: 40 },
      { quality: "superior", weight: 50 },
      { quality: "epic", weight: 10 },
    ],
    fragmentChance: 0.05,
    fragmentItemId: "bamboo_talisman",
  },
  {
    id: "demon_valley", name: "万妖谷", icon: "🌋", unlockLevel: 31, recommendedPower: 12_000,
    energyCost: 15, expReward: 1_200, stonesReward: 700,
    materialPool: [
      { itemId: "ice_soul_fruit", weight: 20, count: 1 },
      { itemId: "millennium_lingzhi", weight: 12, count: 1 },
      { itemId: "spirit_carp", weight: 25, count: 2 },
    ],
    equipChance: 0.15,
    equipQualityPool: [
      { quality: "superior", weight: 50 },
      { quality: "epic", weight: 40 },
      { quality: "immortal", weight: 10 },
    ],
    fragmentChance: 0.08,
    fragmentItemId: "bamboo_talisman",
  },
  {
    id: "blood_sea", name: "幽冥血海", icon: "🌊", unlockLevel: 41, recommendedPower: 40_000,
    energyCost: 18, expReward: 3_000, stonesReward: 1_500,
    materialPool: [
      { itemId: "blood_bodhi", weight: 20, count: 1 },
      { itemId: "dragon_fish", weight: 10, count: 1 },
      { itemId: "century_knotweed", weight: 20, count: 2 },
    ],
    equipChance: 0.12,
    equipQualityPool: [
      { quality: "epic", weight: 60 },
      { quality: "immortal", weight: 40 },
    ],
    fragmentChance: 0.08,
    fragmentItemId: "immortal_blueprint_frag",
  },
  {
    id: "thunder_ruins", name: "雷劫废墟", icon: "⚡", unlockLevel: 51, recommendedPower: 120_000,
    energyCost: 20, expReward: 8_000, stonesReward: 4_000,
    materialPool: [
      { itemId: "illusion_flower", weight: 15, count: 1 },
      { itemId: "thunderwood", weight: 15, count: 1 },
      { itemId: "star_sand", weight: 25, count: 1 },
    ],
    equipChance: 0.1,
    equipQualityPool: [
      { quality: "epic", weight: 40 },
      { quality: "immortal", weight: 60 },
    ],
    fragmentChance: 0.08,
    fragmentItemId: "immortal_blueprint_frag",
  },
  {
    id: "demon_cave", name: "天外魔窟", icon: "👹", unlockLevel: 61, recommendedPower: 350_000,
    energyCost: 20, expReward: 20_000, stonesReward: 10_000,
    materialPool: [
      { itemId: "millennium_lingzhi", weight: 20, count: 1 },
      { itemId: "star_sand", weight: 20, count: 1 },
      { itemId: "golden_fish", weight: 15, count: 1 },
    ],
    equipChance: 0.1,
    equipQualityPool: [
      { quality: "epic", weight: 30 },
      { quality: "immortal", weight: 70 },
    ],
    fragmentChance: 0.1,
    fragmentItemId: "tiandao_shard",
  },
];

export function getDungeon(id: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.id === id);
}

// ============================================================
// 图鉴与成就（数值设计 §17，阶段9 实现作物/材料两类 + 14 个成就）
// ============================================================

export interface CodexCategoryDef {
  key: string;
  label: string;
  icon: string;
  itemIds: string[];
}

export const CODEX_CATEGORIES: CodexCategoryDef[] = [
  {
    key: "crops",
    label: "作物图鉴",
    icon: "🌾",
    itemIds: CROPS.map((c) => c.id),
  },
  {
    key: "materials",
    label: "采集图鉴",
    icon: "⛏️",
    itemIds: [
      ...Object.values(GATHER_TABLES).flatMap((t) => t.items.map((i) => i.itemId)),
      "bamboo_talisman",
      "immortal_blueprint_frag",
      "tiandao_shard",
      "thunderwood",
    ],
  },
];

/** 图鉴收集奖励梯度（数值设计 §17.1，按比例达成时各发一次） */
export const CODEX_TIERS = [
  { pct: 0.1, stones: 500, jades: 0 },
  { pct: 0.25, stones: 2_000, jades: 10 },
  { pct: 0.5, stones: 5_000, jades: 20 },
  { pct: 0.75, stones: 10_000, jades: 30 },
  { pct: 1.0, stones: 20_000, jades: 50 },
] as const;

/** 收集度达标所需数量 = ceil(总数 × 比例) */
export function codexTierCount(total: number, pct: number): number {
  return Math.ceil(total * pct);
}

export type AchievementCondition =
  | { type: "newcomer" } // 初来乍到：创建角色
  | { type: "revenue"; amount: number } // 累计营业额
  | { type: "level"; level: number } // 达到等级
  | { type: "battleWins"; count: number } // 副本通关次数
  | { type: "bambooWins"; count: number } // 青竹林小径通关次数
  | { type: "redHunts"; count: number } // 讨伐红名次数
  | { type: "codexCrops"; count: number } // 作物图鉴解锁数
  | { type: "friends"; count: number }; // 好友数

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  condition: AchievementCondition;
  rewardStones: number;
  rewardJades: number;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "newcomer", name: "初来乍到", desc: "踏入修仙界，创建角色", icon: "🏮", condition: { type: "newcomer" }, rewardStones: 100, rewardJades: 0 },
  { id: "first_gold", name: "第一桶金", desc: "酒馆累计营业额达到 1,000", icon: "💰", condition: { type: "revenue", amount: 1_000 }, rewardStones: 200, rewardJades: 0 },
  { id: "small_profit", name: "薄利多销", desc: "酒馆累计营业额达到 5,000", icon: "🧮", condition: { type: "revenue", amount: 5_000 }, rewardStones: 500, rewardJades: 0 },
  { id: "rich_overnight", name: "一夜暴富", desc: "酒馆累计营业额达到 10,000", icon: "💎", condition: { type: "revenue", amount: 10_000 }, rewardStones: 500, rewardJades: 5 },
  { id: "foundation", name: "登堂入室", desc: "突破至筑基（11 级）", icon: "⛰️", condition: { type: "level", level: 11 }, rewardStones: 1_000, rewardJades: 0 },
  { id: "golden_core", name: "金丹大道", desc: "突破至金丹（21 级）", icon: "🔶", condition: { type: "level", level: 21 }, rewardStones: 5_000, rewardJades: 0 },
  { id: "nascent_soul", name: "元婴出窍", desc: "突破至元婴（31 级）", icon: "👻", condition: { type: "level", level: 31 }, rewardStones: 0, rewardJades: 20 },
  { id: "dungeon_regular", name: "副本常客", desc: "通关任意副本 5 次", icon: "⚔️", condition: { type: "battleWins", count: 5 }, rewardStones: 2_000, rewardJades: 0 },
  { id: "bamboo_killer", name: "竹妖杀手", desc: "通关青竹林小径 3 次", icon: "🎋", condition: { type: "bambooWins", count: 3 }, rewardStones: 300, rewardJades: 0 },
  { id: "night_walker", name: "夜行者", desc: "讨伐红名 1 次", icon: "🌙", condition: { type: "redHunts", count: 1 }, rewardStones: 500, rewardJades: 0 },
  { id: "shennong", name: "神农尝百草", desc: "集齐全部 13 种作物图鉴", icon: "🌿", condition: { type: "codexCrops", count: 13 }, rewardStones: 0, rewardJades: 30 },
  { id: "popular", name: "四海皆友", desc: "拥有 5 位好友", icon: "👥", condition: { type: "friends", count: 5 }, rewardStones: 800, rewardJades: 0 },
];

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((a) => a.id === id);
}
