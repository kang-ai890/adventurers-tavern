import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";

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

export function bindSocketEvents() {
  const store = useGameStore.getState;

  socket.on("connect", () => store().setConnection("online"));
  socket.on("disconnect", () => store().setConnection("offline"));
  socket.io.on("reconnect_attempt", () => store().setConnection("connecting"));

  socket.on("loginResult", (r) => {
    if (r.ok) {
      store().setLoggedIn(true);
      if (r.player) store().setNickname(r.player.nickname);
      socket.emit("plazaJoin", { line: 1 });
    }
  });

  socket.on("plazaPlayers", ({ players }) => store().upsertPlayers(players));

  socket.on("plazaPlayerMoved", (p) => store().movePlayer(p.id, p.x, p.y, p.direction));

  socket.on("plazaPlayerLeft", ({ id }) => store().removePlayer(id));

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

/** 游客登录：设备凭证存 localStorage，注册时携带以绑定数据 */
export function loginAsGuest(nickname: string) {
  localStorage.setItem("tavern.nickname", nickname); // 骨架阶段先本地留存，账号系统接入后随登录上报
  let deviceToken = localStorage.getItem("tavern.deviceToken");
  if (!deviceToken) {
    deviceToken = `d-${crypto.randomUUID()}`;
    localStorage.setItem("tavern.deviceToken", deviceToken);
  }
  socket.emit("login", { guest: { deviceToken } });
}

export function sendPlazaChat(text: string) {
  socket.emit("plazaChat", { text });
}

export function sendPlazaMove(payload: Parameters<ClientToServerEvents["plazaMove"]>[0]) {
  socket.emit("plazaMove", payload);
}
