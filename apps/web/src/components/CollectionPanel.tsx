import { useCallback, useEffect, useState } from "react";
import { CODEX_TIERS, type AchievementsDto, type CodexDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { apiAchievements, apiCodex, apiGetPlayer } from "../net/api";

/** 图鉴与成就面板 */
export function CollectionPanel({ onClose }: { onClose: () => void }) {
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [codex, setCodex] = useState<CodexDto | null>(null);
  const [achievements, setAchievements] = useState<AchievementsDto | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([apiCodex(), apiAchievements()]);
      setCodex(c);
      setAchievements(a);
      if (c.newlyRewarded.length > 0) {
        setNotice(
          `📖 图鉴奖励达成：${c.newlyRewarded
            .map((r) => `${r.category} ${Math.round(r.pct * 100)}%（+${r.stones}灵石${r.jades ? ` +${r.jades}仙玉` : ""}）`)
            .join("；")}`,
        );
        void apiGetPlayer().then(setPlayer);
      }
      if (a.newlyUnlocked.length > 0) {
        setNotice(`🏆 成就达成：${a.newlyUnlocked.join("、")}！`);
        void apiGetPlayer().then(setPlayer);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "加载失败");
    }
  }, [setNotice, setPlayer]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!codex || !achievements) return <div className="farm-empty">翻阅图鉴中…</div>;

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="collection-panel" onClick={(e) => e.stopPropagation()}>
        <h3>📖 图鉴与成就</h3>

        <div className="friend-group-title">图鉴收集（每类独立奖励）</div>
        {codex.categories.map((cat) => (
          <div key={cat.key} className="codex-cat">
            <div className="codex-head">
              <span>
                {cat.icon} {cat.label}
              </span>
              <span className="inv-price">
                {cat.unlocked}/{cat.total}（{cat.pct}%）
              </span>
            </div>
            <div className="quest-bar">
              <div className="quest-bar-fill" style={{ width: `${cat.pct}%` }} />
            </div>
            <div className="codex-tiers">
              {CODEX_TIERS.map((t) => {
                const claimed = cat.claimedTiers.includes(t.pct);
                return (
                  <span key={t.pct} className={`codex-tier ${claimed ? "codex-tier-done" : ""}`}>
                    {Math.round(t.pct * 100)}% 💎{t.stones}
                    {t.jades > 0 ? `✨${t.jades}` : ""}
                    {claimed ? " ✓" : ""}
                  </span>
                );
              })}
            </div>
          </div>
        ))}

        <div className="friend-group-title" style={{ marginTop: 12 }}>
          成就（{achievements.unlockedCount}/{achievements.total}）
        </div>
        <div className="ach-grid">
          {achievements.achievements.map((a) => (
            <div key={a.id} className={`ach-card ${a.unlocked ? "ach-done" : "ach-locked"}`}>
              <div className="ach-icon">{a.unlocked ? a.icon : "🔒"}</div>
              <div className="ach-name">{a.name}</div>
              <div className="ach-desc">{a.desc}</div>
              <div className="ach-reward">
                {a.rewardStones > 0 && <>💎{a.rewardStones}</>}
                {a.rewardJades > 0 && <> ✨{a.rewardJades}</>}
              </div>
            </div>
          ))}
        </div>

        <button className="btn-plain" onClick={onClose} style={{ marginTop: 12 }}>
          关闭
        </button>
      </div>
    </div>
  );
}
