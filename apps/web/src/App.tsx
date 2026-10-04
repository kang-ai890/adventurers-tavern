import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useTranslation } from "react-i18next";
import { useGameStore } from "./store/useGameStore";
import { bindSocketEvents, loginAsGuest, sendPlazaChat, SERVER_URL } from "./net/socket";
import { apiGetFarm, apiGetPlayer, apiGuestLogin } from "./net/api";
import { GameScene } from "./game/GameScene";
import { FarmPanel } from "./components/FarmPanel";

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

/** 登录面板：游客快速进入（REST 建号 + Socket 广场） */
function LoginOverlay() {
  const { t } = useTranslation();
  const loggedIn = useGameStore((s) => s.loggedIn);
  const connection = useGameStore((s) => s.connection);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setFarm = useGameStore((s) => s.setFarm);
  const setLoggedIn = useGameStore((s) => s.setLoggedIn);
  const setNotice = useGameStore((s) => s.setNotice);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);

  if (loggedIn || connection !== "online") return null;

  const enter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let deviceToken = localStorage.getItem("tavern.deviceToken");
      if (!deviceToken) {
        deviceToken = `d-${crypto.randomUUID()}`;
        localStorage.setItem("tavern.deviceToken", deviceToken);
      }
      await apiGuestLogin(deviceToken, nickname.trim() || undefined);
      const [p, f] = await Promise.all([apiGetPlayer(), apiGetFarm()]);
      setPlayer(p);
      setFarm(f);
      setLoggedIn(true);
      loginAsGuest(p.nickname); // Socket 广场占位（阶段 5 接入真实身份）
      setNotice(`欢迎回来，${p.nickname}！初始灵石 ${p.stones}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "进入失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="overlay-icon">🏮</div>
        <h2>{t("login.title")}</h2>
        <input
          className="login-input"
          value={nickname}
          placeholder={t("login.nickname")}
          maxLength={16}
          onChange={(e) => setNickname(e.target.value)}
        />
        <button className="btn-primary" disabled={busy} onClick={() => void enter()}>
          {t("login.guest")}
        </button>
        <div className="login-hint">{t("login.register")}</div>
      </div>
    </div>
  );
}

export default function App() {
  const farmView = useGameStore((s) => s.farmView);

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
    </div>
  );
}
