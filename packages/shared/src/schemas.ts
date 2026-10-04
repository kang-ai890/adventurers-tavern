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

/** 游客登录请求 */
export const GuestLoginSchema = z.object({
  guest: z.object({
    deviceToken: z.string().min(8).max(128),
  }),
});

/** 登录请求（token 与 guest 二选一） */
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
