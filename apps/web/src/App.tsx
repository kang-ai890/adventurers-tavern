import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useTranslation } from "react-i18next";
import { useGameStore } from "./store/useGameStore";
import { bindSocketEvents, loginAsGuest, sendPlazaChat, SERVER_URL } from "./net/socket";
import { GameScene } from "./game/GameScene";

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
  return (
    <div className="hud">
      <div className="hud-title">🍶 冒险者酒馆</div>
      <div className="hud-stats">
        <span className="hud-stat">💎 {t("hud.stones")} 0</span>
        <span className="hud-stat">✨ {t("hud.jades")} 0</span>
        <span className="hud-stat">⚡ {t("hud.energy")} 100/100</span>
        <span className="hud-stat">🧘 {t("hud.realm")} 炼气</span>
      </div>
      <div className="hud-status">
        <span className={`dot ${useGameStore((s) => s.connection)}`} />
        {useGameStore((s) => s.connection) === "online" ? "在线" : "离线"}
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

/** 登录面板：游客快速进入 */
function LoginOverlay() {
  const { t } = useTranslation();
  const loggedIn = useGameStore((s) => s.loggedIn);
  const connection = useGameStore((s) => s.connection);
  const [nickname, setNickname] = useState("");

  if (loggedIn || connection !== "online") return null;

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
        <button className="btn-primary" onClick={() => loginAsGuest(nickname.trim())}>
          {t("login.guest")}
        </button>
        <div className="login-hint">{t("login.register")}</div>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    bindSocketEvents();
    useGameStore.getState().setServerUrl(SERVER_URL);
  }, []);

  return (
    <div className="app">
      <GameCanvas />
      <Hud />
      <ChatPanel />
      <WakeOverlay />
      <LoginOverlay />
    </div>
  );
}
