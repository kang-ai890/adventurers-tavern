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
