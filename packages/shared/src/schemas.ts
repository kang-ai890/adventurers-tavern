import { z } from "zod";

/** 移动意图（客户端→服务端，10Hz 内节流） */
export const MoveIntentSchema = z.object({
  x: z.number().min(0).max(4096),
  y: z.number().min(0).max(4096),
  direction: z.enum(["up", "down", "left", "right"]),
});

/** 聊天消息（长度与敏感词在服务端二次校验） */
export const ChatTextSchema = z.object({
  text: z.string().trim().min(1).max(200),
});

/** 游客登录请求（Socket 握手，阶段2使用） */
export const SocketGuestLoginSchema = z.object({
  guest: z.object({
    deviceToken: z.string().min(8).max(128),
  }),
});

/** 登录请求（token 与 guest 二选一，阶段2使用） */
export const LoginRequestSchema = z
  .object({
    token: z.string().optional(),
    guest: z.object({ deviceToken: z.string().min(8).max(128) }).optional(),
  })
  .refine((v) => v.token || v.guest, { message: "token 或 guest 必填其一" });

/** 注册请求 */
export const RegisterSchema = z.object({
  username: z
    .string()
    .regex(/^[\u4e00-\u9fa5A-Za-z0-9_-]{2,16}$/, "2-16位中英文数字或_-"),
  password: z.string().min(6).max(64),
  deviceToken: z.string().optional(), // 游客转正时携带
});

/** 游客登录请求（REST） */
export const GuestLoginSchema = z.object({
  deviceToken: z.string().min(8).max(128),
  nickname: z.string().trim().min(1).max(16).optional(),
});

/** 种植请求 */
export const PlantSchema = z.object({
  plotIndex: z.number().int().min(0).max(63),
  cropId: z.string().min(2).max(64),
});

/** 收获请求 */
export const HarvestSchema = z.object({
  plotIndex: z.number().int().min(0).max(63),
});

/** 售卖请求 */
export const SellSchema = z.object({
  itemId: z.string().min(2).max(64),
  quantity: z.number().int().min(1).max(9999),
});

/** 建筑升级请求 */
export const UpgradeBuildingSchema = z.object({
  type: z.string().min(1).max(32),
});
