import { EventEmitter } from "node:events";

/** 游戏全局事件总线：跨模块通信（Socket 广播等） */
export const bus = new EventEmitter();

export interface BreakthroughAnnounce {
  playerId: string;
  nickname: string;
  realm: string; // 新境界
}

export const BUS_EVENTS = {
  BREAKTHROUGH: "breakthrough",
} as const;
