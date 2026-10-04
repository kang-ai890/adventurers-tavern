import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma, type Player, type User } from "@tavern/database";
import { expToNext, realmOfLevel, STARTING_STONES, type PlayerDto } from "@tavern/shared";
import { env } from "./env.js";

export interface AuthedRequest extends Request {
  userId: string;
}

export function httpError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** JWT 鉴权中间件 */
export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "未登录" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { sub: string };
    (req as AuthedRequest).userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "登录已过期，请重新进入" });
  }
}

export function publicPlayer(p: Player): PlayerDto {
  return {
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    level: p.level,
    exp: p.exp,
    expToNext: expToNext(p.level),
    realm: realmOfLevel(p.level),
    stones: p.stones,
    jades: p.jades,
    energy: p.energy,
    fame: p.fame,
  };
}

function assertNotBanned(user: User) {
  if (user.status === "BANNED" || (user.bannedUntil && user.bannedUntil.getTime() > Date.now())) {
    const until = user.bannedUntil ? `至 ${user.bannedUntil.toISOString().slice(0, 10)}` : "";
    throw httpError(403, `该账号已被封禁${until}`);
  }
}

/** 确保玩家档存在（历史账号兜底） */
async function ensurePlayer(userId: string, nickname: string): Promise<Player> {
  const existing = await prisma.player.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.player.create({
    data: { userId, nickname, avatar: "default", stones: STARTING_STONES },
  });
}

/** 游客登录：按设备凭证找/建账号，返回 JWT 与玩家数据 */
export async function guestLogin(deviceToken: string, nickname?: string) {
  let user = await prisma.user.findUnique({ where: { deviceToken } });

  if (!user) {
    const defaultName = nickname?.trim() || `游客${deviceToken.slice(-6)}`;
    user = await prisma.user.create({
      data: {
        deviceToken,
        isGuest: true,
        lastLoginAt: new Date(),
        player: {
          create: {
            nickname: defaultName,
            avatar: "default",
            stones: STARTING_STONES,
          },
        },
      },
    });
  } else {
    assertNotBanned(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const existing = await prisma.player.findUnique({ where: { userId: user.id } });
    if (!existing) {
      await prisma.player.create({
        data: {
          userId: user.id,
          nickname: nickname?.trim() || `游客${deviceToken.slice(-6)}`,
          avatar: "default",
          stones: STARTING_STONES,
        },
      });
    } else if (nickname?.trim() && existing.nickname.startsWith("游客")) {
      // 首次设置昵称
      await prisma.player.update({
        where: { id: existing.id },
        data: { nickname: nickname.trim().slice(0, 16) },
      });
    }
  }

  const player = await prisma.player.findUniqueOrThrow({ where: { userId: user.id } });
  return { token: signToken(user.id), player: publicPlayer(player) };
}

/** 注册：无 deviceToken 建新号；带 deviceToken 则游客转正（数据全部保留） */
export async function registerAccount(input: { username: string; password: string; deviceToken?: string }) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  const taken = await prisma.user.findUnique({ where: { username: input.username } });
  if (taken) throw httpError(409, "这个道号已被占用，换一个吧");

  let user: User | null = null;

  if (input.deviceToken) {
    const guest = await prisma.user.findUnique({ where: { deviceToken: input.deviceToken } });
    if (guest && guest.isGuest) {
      // 游客转正：同一 user_id，玩家/背包/灵田数据无缝保留
      user = await prisma.user.update({
        where: { id: guest.id },
        data: { username: input.username, passwordHash, isGuest: false },
      });
    }
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash,
        isGuest: false,
        lastLoginAt: new Date(),
        player: {
          create: { nickname: input.username, avatar: "default", stones: STARTING_STONES },
        },
      },
    });
  }

  const player = await ensurePlayer(user.id, input.username);
  // 游客默认名（游客XXXX）转正后换成道号；玩家自定义昵称保留
  if (player.nickname.startsWith("游客")) {
    await prisma.player.update({
      where: { id: player.id },
      data: { nickname: input.username },
    });
    player.nickname = input.username;
  }
  return { token: signToken(user.id), player: publicPlayer(player) };
}

/** 账号密码登录（多设备同步：任意设备登录同一账号拿到同一份存档） */
export async function loginAccount(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.isGuest || !user.passwordHash) {
    throw httpError(401, "账号或密码错误");
  }
  assertNotBanned(user);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw httpError(401, "账号或密码错误");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const player = await ensurePlayer(user.id, user.username ?? "修士");
  return { token: signToken(user.id), player: publicPlayer(player) };
}

/** 按 userId 取玩家（不存在则 404 错误） */
export async function getPlayerOrThrow(userId: string) {
  const player = await prisma.player.findUnique({ where: { userId } });
  if (!player) {
    throw httpError(404, "玩家不存在");
  }
  return player;
}
