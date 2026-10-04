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
