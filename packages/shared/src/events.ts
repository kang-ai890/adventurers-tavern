/**
 * 前后端共享的 Socket.IO 事件定义（命名空间/事件名与载荷类型）。
 * 客户端 socket.emit / socket.on 与后端一一对应，杜绝字符串拼错。
 */

// ---------- 基础类型 ----------

export interface LoginResult {
  ok: boolean;
  token?: string;
  player?: PlayerPublicInfo;
  error?: string;
}

export interface PlayerPublicInfo {
  id: string;
  nickname: string;
  avatar: string;
  level: number;
  realm: string; // 境界，如 "炼气"
  fame: number; // 口碑
}

/** 摆摊展示（交易行买卖在后续阶段） */
export interface StallInfo {
  title: string;
  itemId: string;
  itemName: string;
  icon: string;
  price: number;
  quantity: number; // 展示库存
}

export interface PlazaPlayer extends PlayerPublicInfo {
  /** Socket 连接 id */
  socketId: string;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
  stall: StallInfo | null;
}

export interface MoveIntent {
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  channel: "plaza" | "party" | "sect" | "system";
  sentAt: string; // ISO 时间
}

export interface Notification {
  type: "announcement" | "mail" | "gift" | "maintenance" | "system";
  title: string;
  body: string;
  sentAt: string;
}

// ---------- 事件映射 ----------

/** 服务端 → 客户端 */
export interface ServerToClientEvents {
  loginResult: (payload: LoginResult) => void;
  plazaPlayers: (payload: { line: number; players: PlazaPlayer[] }) => void;
  plazaPlayerMoved: (payload: { id: string; x: number; y: number; direction: PlazaPlayer["direction"] }) => void;
  plazaPlayerLeft: (payload: { id: string }) => void;
  plazaStallUpdate: (payload: { id: string; stall: StallInfo | null }) => void;
  plazaChat: (payload: ChatMessage) => void;
  notification: (payload: Notification) => void;
  pong: (payload: { at: string }) => void;
}

/** 客户端 → 服务端 */
export interface ClientToServerEvents {
  /** 阶段5：携带 REST 登录拿到的 JWT 接入广场（真实身份） */
  login: (payload: { token?: string; guest?: { deviceToken: string } }) => void;
  plazaJoin: (payload: { line: number }) => void;
  plazaMove: (payload: MoveIntent) => void;
  plazaChat: (payload: { text: string }) => void;
  plazaStall: (payload: { title: string; itemId: string; price: number }) => void;
  plazaStallClose: () => void;
  ping: (payload: { at: string }) => void;
}
