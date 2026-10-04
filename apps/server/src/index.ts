import http from "node:http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { prisma, seedContent } from "@tavern/database";
import {
  DEFAULTS,
  REALMS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type LoginResult,
  type PlazaPlayer,
  type ChatMessage,
} from "@tavern/shared";
import { env } from "./env.js";
import { apiRouter } from "./routes.js";
import { bus, BUS_EVENTS, type BreakthroughAnnounce } from "./bus.js";

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

// ---------- Socket.IO（骨架版：游客握手 + 广场占位） ----------

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: env.CORS_ORIGIN },
});

/** 广场分线内存态（阶段 5 完善：视野广播、分线扩容） */
const plazaLines = new Map<number, Map<string, PlazaPlayer>>();
function getLine(line: number) {
  if (!plazaLines.has(line)) plazaLines.set(line, new Map());
  return plazaLines.get(line)!;
}

io.on("connection", (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on("login", async (_payload) => {
    // 阶段 2 接入完整账号：游客建号 / JWT 校验。骨架版直接放行。
    const result: LoginResult = { ok: true };
    socket.emit("loginResult", result);
  });

  socket.on("plazaJoin", ({ line }) => {
    const room = `plaza:${line}`;
    const players = getLine(line);
    if (players.size >= DEFAULTS.plazaLineCapacity) {
      socket.emit("notification", {
        type: "system",
        title: "坊市拥挤",
        body: "当前分线已满，请稍后再试",
        sentAt: new Date().toISOString(),
      });
      return;
    }
    socket.join(room);
    const me: PlazaPlayer = {
      id: socket.id,
      nickname: `游客-${socket.id.slice(0, 4)}`,
      avatar: "default",
      level: 1,
      realm: "炼气",
      fame: 0,
      x: 200 + Math.floor(Math.random() * 200),
      y: 200 + Math.floor(Math.random() * 200),
      direction: "down",
    };
    players.set(socket.id, me);
    socket.data.plazaLine = line;
    socket.emit("plazaPlayers", { line, players: [...players.values()] });
    socket.to(room).emit("plazaPlayers", { line, players: [me] });
  });

  socket.on("plazaMove", (payload) => {
    const line = socket.data.plazaLine as number | undefined;
    if (line === undefined) return;
    const players = getLine(line);
    const me = players.get(socket.id);
    if (!me) return;
    me.x = payload.x;
    me.y = payload.y;
    me.direction = payload.direction;
    socket.to(`plaza:${line}`).emit("plazaPlayerMoved", {
      id: socket.id,
      x: me.x,
      y: me.y,
      direction: me.direction,
    });
  });

  socket.on("plazaChat", ({ text }) => {
    const line = socket.data.plazaLine as number | undefined;
    const trimmed = text.trim().slice(0, DEFAULTS.chatMaxLength);
    if (!trimmed || line === undefined) return;
    const players = getLine(line);
    const me = players.get(socket.id);
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: socket.id,
      senderName: me?.nickname ?? "无名修士",
      text: trimmed,
      channel: "plaza",
      sentAt: new Date().toISOString(),
    };
    io.to(`plaza:${line}`).emit("plazaChat", msg);
  });

  socket.on("ping", ({ at }) => socket.emit("pong", { at }));

  socket.on("disconnect", () => {
    const line = socket.data.plazaLine as number | undefined;
    if (line !== undefined) {
      getLine(line).delete(socket.id);
      io.to(`plaza:${line}`).emit("plazaPlayerLeft", { id: socket.id });
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
