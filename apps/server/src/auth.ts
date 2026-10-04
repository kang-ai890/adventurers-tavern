import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma, type Player } from "@tavern/database";
import { expToNext, realmOfLevel, STARTING_STONES, type PlayerDto } from "@tavern/shared";
import { env } from "./env.js";

export interface AuthedRequest extends Request {
  userId: string;
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

/** 按 userId 取玩家（不存在则 404 错误） */
export async function getPlayerOrThrow(userId: string) {
  const player = await prisma.player.findUnique({ where: { userId } });
  if (!player) {
    const err = new Error("玩家不存在");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return player;
}
