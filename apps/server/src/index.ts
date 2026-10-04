import http from "node:http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { prisma, seedContent } from "@tavern/database";
import {
  DEFAULTS,
  REALMS,
  realmOfLevel,
  type ChatMessage,
  type ClientToServerEvents,
  type LoginResult,
  type ServerToClientEvents,
} from "@tavern/shared";
import { env } from "./env.js";
import { apiRouter } from "./routes.js";
import { bus, BUS_EVENTS, type BreakthroughAnnounce } from "./bus.js";
import {
  closeStall,
  getPlazaPlayer,
  joinPlaza,
  leavePlaza,
  movePlazaPlayer,
  openStall,
  playersInViewOf,
  type PlayerSnapshot,
} from "./services/plaza.js";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 300 }));
app.use("/api", apiRouter);

// ---------- REST ----------

app.get("/api/health", async (_req, res) => {
  let db = "unknown";
  try {
    await prisma.user.count();
    db = "ok";
  } catch {
    db = "error";
  }
  res.json({ status: "ok", db, version: "0.2.0", time: new Date().toISOString() });
});

app.get("/api/meta", (_req, res) => {
  res.json({
    name: "《冒险者酒馆》Adventurer's Tavern",
    realms: REALMS,
    features: ["经营", "境界", "野外PK", "组队副本", "交易行", "宗门"],
  });
});

// ---------- Socket.IO（阶段5：JWT 真实身份 + 视野广播 + 摆摊展示） ----------

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: env.CORS_ORIGIN },
});

/** 解析 JWT → 玩家快照（供广场上屏使用） */
async function resolvePlayerByToken(token: string): Promise<PlayerSnapshot | null> {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const player = await prisma.player.findUnique({ where: { userId: payload.sub } });
    if (!player) return null;
    return {
      playerId: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      level: player.level,
      realm: realmOfLevel(player.level),
      fame: player.fame,
    };
  } catch {
    return null;
  }
}

io.on("connection", (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on("login", async (payload) => {
    const result: LoginResult = { ok: false, error: "登录失败" };
    if (payload.token) {
      const snapshot = await resolvePlayerByToken(payload.token);
      if (snapshot) {
        socket.data.snapshot = snapshot;
        socket.data.authenticated = true;
        result.ok = true;
      }
    }
    socket.emit("loginResult", result);
  });

  socket.on("plazaJoin", async ({ line }) => {
    const snapshot = socket.data.snapshot as PlayerSnapshot | undefined;
    if (!snapshot) {
      socket.emit("notification", {
        type: "system",
        title: "未登录",
        body: "请先登录再进入坊市",
        sentAt: new Date().toISOString(),
      });
      return;
    }
    const joined = await joinPlaza(line, socket.id, snapshot);
    if (!joined.ok || !joined.me) {
      socket.emit("notification", {
        type: "system",
        title: "坊市拥挤",
        body: joined.error ?? "当前分线已满，请稍后再试",
        sentAt: new Date().toISOString(),
      });
      return;
    }
    socket.join(`plaza:${line}`);
    socket.data.plazaLine = line;
    socket.emit("plazaPlayers", { line, players: joined.players });
    // 只通知视野内的其他玩家（新人出生点附近）
    const inView = playersInViewOf(line, joined.me.x, joined.me.y, socket.id);
    if (inView.length > 0) {
      socket.to(`plaza:${line}`).emit("plazaPlayers", { line, players: [joined.me] });
    }
  });

  socket.on("plazaMove", (payload) => {
    const line = socket.data.plazaLine as number | undefined;
    if (line === undefined) return;
    const me = movePlazaPlayer(socket.id, payload.x, payload.y, payload.direction);
    if (!me) return;
    // 视野广播：只发给距离 ≤ 视野半径的玩家
    for (const viewer of playersInViewOf(line, me.x, me.y, socket.id)) {
      io.to(viewer.socketId).emit("plazaPlayerMoved", {
        id: me.id,
        x: me.x,
        y: me.y,
        direction: me.direction,
      });
    }
  });

  socket.on("plazaChat", ({ text }) => {
    const line = socket.data.plazaLine as number | undefined;
    const trimmed = text.trim().slice(0, DEFAULTS.chatMaxLength);
    if (!trimmed || line === undefined) return;
    const snapshot = socket.data.snapshot as PlayerSnapshot | undefined;
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: socket.id,
      senderName: snapshot?.nickname ?? "无名修士",
      text: trimmed,
      channel: "plaza",
      sentAt: new Date().toISOString(),
    };
    io.to(`plaza:${line}`).emit("plazaChat", msg);
  });

  socket.on("plazaStall", async (payload) => {
    const line = socket.data.plazaLine as number | undefined;
    if (line === undefined) return;
    const result = await openStall(socket.id, payload);
    if (!result.ok) {
      socket.emit("notification", {
        type: "system",
        title: "摆摊失败",
        body: result.error ?? "未知错误",
        sentAt: new Date().toISOString(),
      });
      return;
    }
    io.to(`plaza:${line}`).emit("plazaStallUpdate", { id: result.stall ? (getPlazaPlayer(socket.id)?.id ?? socket.id) : socket.id, stall: result.stall });
  });

  socket.on("plazaStallClose", () => {
    const line = socket.data.plazaLine as number | undefined;
    const stall = closeStall(socket.id);
    if (line !== undefined && stall) {
      const me = getPlazaPlayer(socket.id);
      io.to(`plaza:${line}`).emit("plazaStallUpdate", { id: me?.id ?? socket.id, stall: null });
    }
  });

  socket.on("ping", ({ at }) => socket.emit("pong", { at }));

  socket.on("disconnect", () => {
    const me = getPlazaPlayer(socket.id);
    const line = leavePlaza(socket.id).line;
    if (line !== null && me) {
      io.to(`plaza:${line}`).emit("plazaPlayerLeft", { id: me.id });
    }
    console.log(`[socket] disconnected ${socket.id}`);
  });
});

// ---------- 游戏事件广播 ----------

bus.on(BUS_EVENTS.BREAKTHROUGH, (announce: BreakthroughAnnounce) => {
  const notification = {
    type: "announcement" as const,
    title: "✨ 有人突破了！",
    body: `【${announce.nickname}】渡劫成功，突破至${announce.realm}境界！四方雷动，恭贺新晋大能！`,
    sentAt: new Date().toISOString(),
  };
  io.emit("notification", notification);
  io.emit("plazaChat", {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderId: "system",
    senderName: "系统",
    text: `🎉 ${announce.nickname} 突破至【${announce.realm}】境界！`,
    channel: "system",
    sentAt: new Date().toISOString(),
  });
});

// ---------- 启动 ----------

async function bootstrap() {
  try {
    await seedContent();
  } catch (err) {
    console.warn("[server] 数据库初始化失败（迁移了吗？）:", err instanceof Error ? err.message : err);
  }

  server.listen(env.PORT, () => {
    console.log(`🍶 《冒险者酒馆》服务已启动 http://localhost:${env.PORT}`);
    console.log(`   环境: ${env.NODE_ENV} · 广场每线容量: ${DEFAULTS.plazaLineCapacity}`);
  });
}

void bootstrap();

async function shutdown() {
  console.log("[server] 正在关闭…");
  io.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
