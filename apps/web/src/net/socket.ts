import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { getToken } from "./api";

export type TavernSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? window.location.origin;

export { SERVER_URL };

export const socket: TavernSocket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  transports: ["websocket", "polling"],
});

/** 广场分线状态（人数最少的分线） */
let bestLine = 1;

async function fetchBestLine(): Promise<number> {
  try {
    const res = await fetch(`${SERVER_URL}/api/plaza`);
    const data = (await res.json()) as { bestLine?: number };
    if (data.bestLine) bestLine = data.bestLine;
  } catch {
    /* 保持默认 */
  }
  return bestLine;
}

/** REST 登录成功后调用：Socket 携带 JWT 接入广场真实身份 */
export async function socketLogin() {
  const token = getToken();
  if (!token) return;
  socket.emit("login", { token });
}

async function joinPlaza() {
  await fetchBestLine();
  socket.emit("plazaJoin", { line: bestLine });
}

export function bindSocketEvents() {
  const store = useGameStore.getState;

  socket.on("connect", () => {
    store().setConnection("online");
    // 断线重连：已有 token 则自动重新登录进广场
    if (getToken()) {
      socket.emit("login", { token: getToken()! });
    }
  });
  socket.on("disconnect", () => store().setConnection("offline"));
  socket.io.on("reconnect_attempt", () => store().setConnection("connecting"));

  socket.on("loginResult", (r) => {
    if (r.ok) {
      void joinPlaza();
    }
  });

  socket.on("plazaPlayers", ({ players }) => store().upsertPlayers(players));

  socket.on("plazaPlayerMoved", (p) => store().movePlayer(p.id, p.x, p.y, p.direction));

  socket.on("plazaPlayerLeft", ({ id }) => store().removePlayer(id));

  socket.on("plazaStallUpdate", ({ id, stall }) => store().setPlayerStall(id, stall));

  socket.on("plazaChat", (msg) => store().addChat(msg));

  socket.on("notification", (n) =>
    store().addChat({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: "system",
      senderName: "系统",
      text: n.body,
      channel: "system",
      sentAt: n.sentAt,
    }),
  );
}

export function sendPlazaChat(text: string) {
  socket.emit("plazaChat", { text });
}

export function sendPlazaMove(payload: Parameters<ClientToServerEvents["plazaMove"]>[0]) {
  socket.emit("plazaMove", payload);
}

export function sendPlazaStall(payload: { title: string; itemId: string; price: number }) {
  socket.emit("plazaStall", payload);
}

export function sendPlazaStallClose() {
  socket.emit("plazaStallClose");
}
