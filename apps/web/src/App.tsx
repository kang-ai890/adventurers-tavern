import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useTranslation } from "react-i18next";
import { isRealmCapLevel } from "@tavern/shared";
import { useGameStore } from "./store/useGameStore";
import { bindSocketEvents, loginAsGuest, sendPlazaChat, SERVER_URL } from "./net/socket";
import { apiGetFarm, apiGetPlayer, apiGuestLogin, apiLogin, apiLogout, apiRegister } from "./net/api";
import { GameScene } from "./game/GameScene";
import { FarmPanel } from "./components/FarmPanel";
import { BreakthroughPanel } from "./components/BreakthroughPanel";
import { QuestPanel } from "./components/QuestPanel";

/** 游戏画布：挂载 Phaser */
function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current!,
      backgroundColor: "#2b3a2f",
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [GameScene],
    });
    return () => game.destroy(true);
  }, []);

  return <div ref={containerRef} className="game-canvas" />;
}

/** 顶部 HUD */
function Hud() {
  const { t } = useTranslation();
  const player = useGameStore((s) => s.player);
  const connection = useGameStore((s) => s.connection);
  const farmView = useGameStore((s) => s.farmView);
  const setFarmView = useGameStore((s) => s.setFarmView);
  const setActivePanel = useGameStore((s) => s.setActivePanel);

  return (
    <div className="hud">
      <div className="hud-title">🍶 冒险者酒馆</div>
      <div className="hud-stats">
        <span className="hud-stat">💎 {t("hud.stones")} {player?.stones ?? 0}</span>
        <span className="hud-stat">✨ {t("hud.jades")} {player?.jades ?? 0}</span>
        <span className="hud-stat">⚡ {t("hud.energy")} {player?.energy ?? 100}/100</span>
        <span className="hud-stat">
          🧘 {player?.realm ?? "炼气"} Lv.{player?.level ?? 1}（{player?.exp ?? 0}/{player?.expToNext ?? 150}）
        </span>
      </div>
      <button
        className="hud-btn"
        onClick={() => setFarmView(!farmView)}
        style={{ pointerEvents: "auto" }}
      >
        {farmView ? "🏘 回坊市" : "🏡 我的领地"}
      </button>
      <button className="hud-btn" style={{ pointerEvents: "auto" }} onClick={() => setActivePanel("quests")}>
        📜 委托
      </button>
      {player && isRealmCapLevel(player.level) && (
        <button className="hud-btn hud-btn-gold" style={{ pointerEvents: "auto" }} onClick={() => setActivePanel("breakthrough")}>
          ⛩️ 突破
        </button>
      )}
      <button
        className="hud-btn"
        onClick={() => {
          apiLogout();
          window.location.reload();
        }}
        style={{ pointerEvents: "auto" }}
      >
        🚪 退出
      </button>
      <div className="hud-status">
        <span className={`dot ${connection}`} />
        {connection === "online" ? "在线" : "离线"}
      </div>
    </div>
  );
}

/** 聊天面板 */
function ChatPanel() {
  const { t } = useTranslation();
  const chat = useGameStore((s) => s.chat);
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    sendPlazaChat(text);
    setText("");
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg chat-${m.channel}`}>
            <span className="chat-name">{m.senderName}：</span>
            {m.text}
          </div>
        ))}
      </div>
      <input
        className="chat-input"
        value={text}
        placeholder={t("chat.placeholder")}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
    </div>
  );
}

/** 全局提示条 */
function Toast() {
  const notice = useGameStore((s) => s.notice);
  const setNotice = useGameStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  if (!notice) return null;
  return <div className="toast">{notice}</div>;
}

/** 连接遮罩：免费服务器冷启动提示 */
function WakeOverlay() {
  const { t } = useTranslation();
  const connection = useGameStore((s) => s.connection);
  if (connection === "online") return null;
  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="overlay-icon">🍶</div>
        <h2>{t("wake.title")}</h2>
        <p>{t("wake.body")}</p>
        <div className="spinner" />
        <p className="overlay-status">{t("wake.connecting")}</p>
      </div>
    </div>
  );
}

/** 登录面板：游客 / 注册 / 登录 三模式 */
function LoginOverlay() {
  const { t } = useTranslation();
  const loggedIn = useGameStore((s) => s.loggedIn);
  const connection = useGameStore((s) => s.connection);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setFarm = useGameStore((s) => s.setFarm);
  const setLoggedIn = useGameStore((s) => s.setLoggedIn);
  const setAccountType = useGameStore((s) => s.setAccountType);
  const setNotice = useGameStore((s) => s.setNotice);

  const [mode, setMode] = useState<"guest" | "register" | "login">("guest");
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loggedIn || connection !== "online") return null;

  const finishLogin = async (kind: "guest" | "registered", notice: string) => {
    const [p, f] = await Promise.all([apiGetPlayer(), apiGetFarm()]);
    setPlayer(p);
    setFarm(f);
    setAccountType(kind);
    setLoggedIn(true);
    loginAsGuest(p.nickname); // Socket 广场占位（阶段 5 接入真实身份）
    setNotice(notice);
  };

  const enter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const deviceToken = localStorage.getItem("tavern.deviceToken") ?? undefined;
      if (mode === "guest") {
        const d = deviceToken ?? `d-${crypto.randomUUID()}`;
        if (!deviceToken) localStorage.setItem("tavern.deviceToken", d);
        await apiGuestLogin(d, nickname.trim() || undefined);
        await finishLogin("guest", "进入酒馆，祝掌柜生意兴隆！");
      } else if (mode === "register") {
        await apiRegister(username.trim(), password, deviceToken);
        await finishLogin(
          "registered",
          deviceToken ? "转正成功！游客数据已全部保留 🎉" : "注册成功！欢迎踏入修仙界",
        );
      } else {
        await apiLogin(username.trim(), password);
        await finishLogin("registered", "欢迎回来，道友！");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: "guest" | "register" | "login"; label: string }> = [
    { key: "guest", label: t("login.guest") },
    { key: "register", label: "注册账号" },
    { key: "login", label: "登录" },
  ];

  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="overlay-icon">🏮</div>
        <h2>{t("login.title")}</h2>
        <div className="login-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`login-tab ${mode === tab.key ? "login-tab-active" : ""}`}
              onClick={() => setMode(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {mode === "guest" && (
          <input
            className="login-input"
            value={nickname}
            placeholder={t("login.nickname")}
            maxLength={16}
            onChange={(e) => setNickname(e.target.value)}
          />
        )}
        {(mode === "register" || mode === "login") && (
          <>
            <input
              className="login-input"
              value={username}
              placeholder="道号（2-16位中英文数字）"
              maxLength={16}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="login-input"
              type="password"
              value={password}
              placeholder="密码（至少6位）"
              maxLength={64}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void enter()}
            />
          </>
        )}
        <button className="btn-primary" disabled={busy} onClick={() => void enter()}>
          {busy ? "请稍候…" : mode === "guest" ? t("login.guest") : mode === "register" ? "注册并进入" : "登录"}
        </button>
        <div className="login-hint">
          {mode === "guest" ? "游客数据存于本机，注册后可转正保留" : mode === "register" ? "本机有游客档案时将自动转正（数据保留）" : "任意设备登录同一账号，存档互通"}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const farmView = useGameStore((s) => s.farmView);
  const activePanel = useGameStore((s) => s.activePanel);
  const setActivePanel = useGameStore((s) => s.setActivePanel);

  useEffect(() => {
    bindSocketEvents();
    useGameStore.getState().setServerUrl(SERVER_URL);
  }, []);

  return (
    <div className="app">
      <GameCanvas />
      <Hud />
      {!farmView && <ChatPanel />}
      <Toast />
      <WakeOverlay />
      <LoginOverlay />
      {farmView && (
        <div className="farm-overlay">
          <FarmPanel onClose={() => useGameStore.getState().setFarmView(false)} />
        </div>
      )}
      {activePanel === "breakthrough" && <BreakthroughPanel onClose={() => setActivePanel(null)} />}
      {activePanel === "quests" && <QuestPanel onClose={() => setActivePanel(null)} />}
    </div>
  );
}
