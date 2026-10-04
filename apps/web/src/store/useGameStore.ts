import { create } from "zustand";
import type { ChatMessage, PlazaPlayer } from "@tavern/shared";

export type ConnectionStatus = "connecting" | "online" | "offline";

interface GameState {
  connection: ConnectionStatus;
  serverUrl: string;
  loggedIn: boolean;
  playerId: string | null;
  nickname: string;
  nearby: Record<string, PlazaPlayer>;
  chat: ChatMessage[];
  setConnection: (s: ConnectionStatus) => void;
  setServerUrl: (url: string) => void;
  setNickname: (name: string) => void;
  setLoggedIn: (v: boolean) => void;
  onLoginResult: (ok: boolean) => void;
  upsertPlayers: (players: PlazaPlayer[]) => void;
  movePlayer: (id: string, x: number, y: number, direction: PlazaPlayer["direction"]) => void;
  removePlayer: (id: string) => void;
  addChat: (msg: ChatMessage) => void;
}

export const useGameStore = create<GameState>((set) => ({
  connection: "connecting",
  serverUrl: "",
  loggedIn: false,
  playerId: null,
  nickname: "",
  nearby: {},
  chat: [],

  setConnection: (connection) => set({ connection }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setNickname: (nickname) => set({ nickname }),
  setLoggedIn: (loggedIn) => set({ loggedIn }),
  onLoginResult: (ok) => set({ loggedIn: ok }),

  upsertPlayers: (players) =>
    set((s) => {
      const nearby = { ...s.nearby };
      for (const p of players) nearby[p.id] = p;
      return { nearby };
    }),

  movePlayer: (id, x, y, direction) =>
    set((s) => {
      const p = s.nearby[id];
      if (!p) return s;
      return { nearby: { ...s.nearby, [id]: { ...p, x, y, direction } } };
    }),

  removePlayer: (id) =>
    set((s) => {
      if (!(id in s.nearby)) return s;
      const nearby = { ...s.nearby };
      delete nearby[id];
      return { nearby };
    }),

  addChat: (msg) =>
    set((s) => ({ chat: [...s.chat.slice(-49), msg] })),
}));
