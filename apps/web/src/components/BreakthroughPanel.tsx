import { useEffect, useState } from "react";
import type { BreakthroughInfoDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { apiBreakthrough, apiBreakthroughInfo, apiGetPlayer } from "../net/api";

/** 渡劫突破面板 */
export function BreakthroughPanel({ onClose }: { onClose: () => void }) {
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [info, setInfo] = useState<BreakthroughInfoDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const capLevel = Math.ceil((player?.level ?? 1) / 10) * 10;

  const load = async () => {
    try {
      setInfo(await apiBreakthroughInfo());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attempt = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiBreakthrough();
      setNotice(result.message);
      setPlayer(await apiGetPlayer());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "突破失败");
    } finally {
      setBusy(false);
    }
  };

  const cooldownLeft =
    info?.cooldownUntil && new Date(info.cooldownUntil).getTime() > Date.now()
      ? Math.ceil((new Date(info.cooldownUntil).getTime() - Date.now()) / 3_600_000)
      : 0;

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="bt-panel" onClick={(e) => e.stopPropagation()}>
        <h3>⛩️ 渡劫突破</h3>
        {error && <div className="bt-error">{error}</div>}
        {!info && !error && <div className="farm-empty">推演天机中…</div>}
        {info && (
          <>
            {info.maxedOut ? (
              <div className="bt-body">
                <p>已达{info.currentRealm}巅峰（90 级），飞升转生系统将在后续版本开放。</p>
              </div>
            ) : !info.available ? (
              <div className="bt-body">
                <p>
                  当前【{info.currentRealm}】，需修炼至 {capLevel} 级（境界满级）且修为圆满，方可尝试突破至【{info.targetRealm}】。
                </p>
              </div>
            ) : (
              <div className="bt-body">
                <div className="bt-realm">
                  【{info.currentRealm}】 → 【{info.targetRealm}】
                </div>
                <div className="bt-row">
                  <span>灵石</span>
                  <span className={info.stonesHave >= info.stonesCost ? "bt-ok" : "bt-lack"}>
                    {info.stonesHave} / {info.stonesCost}
                  </span>
                </div>
                {info.materials.map((m) => (
                  <div className="bt-row" key={m.itemId}>
                    <span>
                      {m.icon} {m.name}
                    </span>
                    <span className={m.have >= m.need ? "bt-ok" : "bt-lack"}>
                      {m.have} / {m.need}
                    </span>
                  </div>
                ))}
                <div className="bt-row">
                  <span>成功率</span>
                  <span className="bt-ok">
                    {Math.round(info.successRate * 100)}%
                    {info.compensation > 0 && (
                      <span className="bt-comp">（含失败补偿 +{Math.round(info.compensation * 100)}%）</span>
                    )}
                  </span>
                </div>
                {info.fails > 0 && (
                  <div className="bt-fail">已连续失败 {info.fails} 次，屡败屡战，天道酬勤</div>
                )}
                {cooldownLeft > 0 && (
                  <div className="bt-fail">雷劫余威未散，需静养约 {cooldownLeft} 小时</div>
                )}
                <button
                  className="btn-primary"
                  disabled={busy || cooldownLeft > 0}
                  onClick={() => void attempt()}
                  style={{ marginTop: 12 }}
                >
                  {busy ? "渡劫中…" : cooldownLeft > 0 ? "静养中" : "⚡ 引雷渡劫"}
                </button>
                <div className="login-hint">失败：修为 -20%、材料与灵石尽毁、冷却 24 小时；连续失败提高成功率</div>
              </div>
            )}
          </>
        )}
        <button className="btn-plain" onClick={onClose} style={{ marginTop: 10 }}>
          关闭
        </button>
      </div>
    </div>
  );
}
