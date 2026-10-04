/**
 * 共享常量：境界、游戏配置键、公共规则数值（与 docs 数值设计文档保持一致）。
 */

/** 修仙境界（核心升级线），index 即境界层级 */
export const REALMS = [
  "炼气",
  "筑基",
  "金丹",
  "元婴",
  "化神",
  "炼虚",
  "合体",
  "大乘",
  "渡劫",
] as const;

export type Realm = (typeof REALMS)[number];

/** 境界解锁规则 */
export const REALM_RULES: Record<Realm, { minLevel: number; unlocks: string[] }> = {
  炼气: { minLevel: 1, unlocks: ["基础作物", "烹饪", "坊市"] },
  筑基: { minLevel: 11, unlocks: ["野外地图与PK", "钓鱼采矿", "一阶副本"] },
  金丹: { minLevel: 21, unlocks: ["炼丹炉", "宗门", "拍卖行"] },
  元婴: { minLevel: 31, unlocks: ["灵宠进化", "世界BOSS", "武道大会"] },
  化神: { minLevel: 41, unlocks: ["飞升系统", "高阶副本", "稀有时装"] },
  炼虚: { minLevel: 51, unlocks: ["终局内容"] },
  合体: { minLevel: 61, unlocks: ["跨服活动(远期)"] },
  大乘: { minLevel: 71, unlocks: ["渡劫试炼"] },
  渡劫: { minLevel: 80, unlocks: ["飞升转生"] },
};

/** 游戏配置键（game_configs 表，管理后台热改） */
export const GAME_CONFIG_KEYS = {
  energyMax: "player.energy.max",
  energyRecoverMinutes: "player.energy.recover_minutes",
  cropGrowMinutes: "crop.{id}.grow_minutes", // 模板示例
  tradeTaxRate: "market.trade_tax_rate",
  auctionExtendSeconds: "auction.extend_seconds",
  pkCooldownMinutes: "pk.same_target_cooldown_minutes",
  pkKillScore: "pk.kill_score_per_attack",
  pkLootRatio: "pk.loot_ratio",
  redNameDecayPerHour: "pk.red_name_decay_per_hour",
  worldBossTime: "world_boss.daily_time",
  tournamentRake: "tournament.bet_rake",
} as const;

/** 公共规则默认值（开发期初值，正式值以后台配置为准） */
export const DEFAULTS = {
  plazaLineCapacity: 50,
  plazaBroadcastHz: 10,
  plazaViewRange: 15, // 视野半径（格）
  chatMaxLength: 200,
  socketHeartbeatMs: 30_000,
} as const;
