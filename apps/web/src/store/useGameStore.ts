import { create } from "zustand";
import type {
  ChatMessage,
  FarmStateDto,
  InventoryItemDto,
  PlazaPlayer,
  PlayerDto,
  StallInfo,
} from "@tavern/shared";

export type ConnectionStatus = "connecting" | "online" | "offline";
export type AccountType = "guest" | "registered" | null;

interface GameState {
  connection: ConnectionStatus;
  serverUrl: string;
  loggedIn: boolean;
  accountType: AccountType;
  playerId: string | null;
  nickname: string;
  nearby: Record<string, PlazaPlayer>;
  chat: ChatMessage[];

  // 阶段 1：经营核心
  player: PlayerDto | null;
  farm: FarmStateDto | null;
  farmView: boolean;
  notice: string | null; // 操作结果提示
  activePanel: "breakthrough" | "quests" | "friends" | null;
  myStall: StallInfo | null; // 我自己的摊位

  setConnection: (s: ConnectionStatus) => void;
  setServerUrl: (url: string) => void;
  setNickname: (name: string) => void;
  setLoggedIn: (v: boolean) => void;
  setAccountType: (t: AccountType) => void;
  onLoginResult: (ok: boolean) => void;
  upsertPlayers: (players: PlazaPlayer[]) => void;
  movePlayer: (id: string, x: number, y: number, direction: PlazaPlayer["direction"]) => void;
  removePlayer: (id: string) => void;
  setPlayerStall: (id: string, stall: StallInfo | null) => void;
  addChat: (msg: ChatMessage) => void;

  setPlayer: (p: PlayerDto) => void;
  setFarm: (f: FarmStateDto) => void;
  setFarmView: (v: boolean) => void;
  setNotice: (n: string | null) => void;
  setActivePanel: (p: GameState["activePanel"]) => void;
  setMyStall: (s: StallInfo | null) => void;
  applyInventoryChange: (itemId: string, delta: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  connection: "connecting",
  serverUrl: "",
  loggedIn: false,
  accountType: null,
  playerId: null,
  nickname: "",
  nearby: {},
  chat: [],

  player: null,
  farm: null,
  farmView: false,
  notice: null,
  activePanel: null,
  myStall: null,

  setConnection: (connection) => set({ connection }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setNickname: (nickname) => set({ nickname }),
  setLoggedIn: (loggedIn) => set({ loggedIn }),
  setAccountType: (accountType) => set({ accountType }),
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

  setPlayerStall: (id, stall) =>
    set((s) => {
      const p = s.nearby[id];
      if (!p) return s;
      return { nearby: { ...s.nearby, [id]: { ...p, stall } } };
    }),

  addChat: (msg) => set((s) => ({ chat: [...s.chat.slice(-49), msg] })),

  setPlayer: (player) => set({ player, nickname: player.nickname, playerId: player.id }),
  setFarm: (farm) => set({ farm }),
  setFarmView: (farmView) => set({ farmView }),
  setNotice: (notice) => set({ notice }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setMyStall: (myStall) => set({ myStall }),

  applyInventoryChange: (itemId, delta) =>
    set((s) => {
      if (!s.farm) return s;
      const inv = s.farm.inventory.map((row: InventoryItemDto) =>
        row.itemId === itemId ? { ...row, quantity: row.quantity + delta } : row,
      );
      return { farm: { ...s.farm, inventory: inv } };
    }),
}));
