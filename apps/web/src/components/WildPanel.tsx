import { useCallback, useEffect, useState } from "react";
import type { AttackResultDto, WildDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import {
  apiGetPlayer,
  apiWild,
  apiWildAttack,
  apiWildEnter,
  apiWildGather,
  apiWildLeave,
} from "../net/api";

const SPOTS: Array<{ key: "fish" | "mine" | "herb"; label: string; icon: string }> = [
  { key: "fish", label: "钓鱼", icon: "🎣" },
  { key: "mine", label: "挖矿", icon: "⛏️" },
  { key: "herb", label: "采药", icon: "🌿" },
];

/** 野外面板：采集 / 在野玩家袭击 / 悬赏榜 */
export function WildPanel({ onClose }: { onClose: () => void }) {
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [wild, setWild] = useState<WildDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [attackResult, setAttackResult] = useState<AttackResultDto | null>(null);

  const load = useCallback(async () => {
    try {
      setWild(await apiWild());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "野外信息加载失败");
    }
  }, [setNotice]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    // 打开面板即进入野外（筑基以上），关闭时离开
    if ((useGameStore.getState().player?.level ?? 0) >= 11) {
      void apiWildEnter().catch(() => undefined);
    }
    return () => {
      clearInterval(timer);
      void apiWildLeave().catch(() => undefined);
    };
  }, [load]);

  const refreshPlayer = async () => {
    setPlayer(await apiGetPlayer());
  };

  const gather = async (spotType: "fish" | "mine" | "herb") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiWildGather(spotType);
      setNotice(`收获 ${r.icon} ${r.itemName}！修为 +${r.exp}${r.levelUps > 0 ? `，升至 ${r.newLevel} 级！` : ""}（体力 ${r.energyLeft}/100）`);
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "采集失败");
    } finally {
      setBusy(false);
    }
  };

  const attack = async (targetPlayerId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiWildAttack(targetPlayerId);
      setAttackResult(r);
      setNotice(r.message);
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "袭击失败");
    } finally {
      setBusy(false);
    }
  };

  if (!wild) return <div className="farm-empty">正在观察野外动静…</div>;

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="wild-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wild-header">
          <h3>🗺️ 野外 · {wild.season}季</h3>
          <span className="wild-energy">⚡ 体力 {wild.energy}/{wild.energyMax}</span>
        </div>
        {player && player.level < 11 ? (
          <div className="farm-empty">筑基（11 级）之后方可踏足野外。江湖险恶，先回酒馆修行吧。</div>
        ) : (
          <>
            <div className="friend-group">
              <div className="friend-group-title">采集点（每次耗 1 体力，产物可被其他修士抢夺！）</div>
              <div className="wild-spots">
                {SPOTS.map((s) => (
                  <button key={s.key} className="event-option" disabled={busy} onClick={() => void gather(s.key)}>
                    <b>
                      {s.icon} {s.label}
                    </b>
                    <span>点击采集</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="friend-group">
              <div className="friend-group-title">
                在野修士（{wild.wildPlayers.length}）—— 袭击可抢夺对方背包采集物
              </div>
              {wild.wildPlayers.length === 0 && <div className="farm-empty">四下无人，安心采集</div>}
              {wild.wildPlayers.map((w) => (
                <div key={w.playerId} className="inv-row">
                  <span className="inv-name">
                    {w.red ? "🔴" : ""} {w.nickname}
                  </span>
                  <span className="inv-price">
                    {w.realm} Lv.{w.level}
                  </span>
                  <button className="btn-sell" disabled={busy} onClick={() => void attack(w.playerId)}>
                    ⚔️ 袭击
                  </button>
                </div>
              ))}
            </div>

            <div className="friend-group">
              <div className="friend-group-title">悬赏榜（讨伐红名不涨杀孽，可领全额悬赏）</div>
              {wild.bounty.length === 0 && <div className="farm-empty">暂无红名修士</div>}
              {wild.bounty.map((b) => (
                <div key={b.playerId} className="inv-row">
                  <span className="inv-name">🔴 {b.nickname}</span>
                  <span className="inv-price">
                    {b.realm} · 杀孽 {b.killScore}
                  </span>
                  <span className="inv-qty">悬赏 {b.bounty} 灵石</span>
                  <button className="btn-sell" disabled={busy} onClick={() => void attack(b.playerId)}>
                    讨伐
                  </button>
                </div>
              ))}
            </div>

            <div className="login-hint">
              袭击规则：抢夺 10%~30% 采集物（境界差加成）；主动袭击 +100 杀孽（红名禁入坊市，可被讨伐）；同一目标 30 分钟冷却。
            </div>
          </>
        )}
        <button className="btn-plain" onClick={onClose} style={{ marginTop: 10 }}>
          返回坊市
        </button>

        {attackResult && (
          <div className="farm-modal">
            <div className="event-panel">
              <div className="event-title">{attackResult.success ? "⚔️ 袭击得手" : "💥 袭击失败"}</div>
              <div className="event-text">{attackResult.message}</div>
              {attackResult.bountyReward > 0 && (
                <div className="event-effect">
                  悬赏奖励：<b>+{attackResult.bountyReward} 灵石</b>
                </div>
              )}
              {attackResult.loot.length > 0 && (
                <div className="event-effects">
                  {attackResult.loot.map((l, i) => (
                    <div key={i} className="event-effect">
                      {attackResult.success ? "缴获" : "损失"}：<b>{l.icon}{l.name} ×{l.quantity}</b>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setAttackResult(null)}>
                知道了
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
