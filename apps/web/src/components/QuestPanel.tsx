import { useEffect, useState } from "react";
import type { QuestDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { apiClaimQuest, apiGetPlayer, apiQuests } from "../net/api";

const TYPE_LABEL: Record<QuestDto["type"], string> = {
  plant: "种植",
  harvest: "收获",
  sell: "出售",
};

/** 委托任务板 */
export function QuestPanel({ onClose }: { onClose: () => void }) {
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [quests, setQuests] = useState<QuestDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setQuests(await apiQuests());
  };
  useEffect(() => {
    load().catch((e) => setNotice(e instanceof Error ? e.message : "加载失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claim = async (quest: QuestDto) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiClaimQuest(quest.id);
      setNotice(`完成委托「${quest.name}」！灵石 +${r.rewardStones}，修为 +${r.rewardExp}${r.levelUps > 0 ? `，升至 ${r.newLevel} 级！` : ""}`);
      setPlayer(await apiGetPlayer());
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "领取失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="quest-panel" onClick={(e) => e.stopPropagation()}>
        <h3>📜 委托任务板</h3>
        <div className="login-hint" style={{ marginBottom: 10 }}>
          每日 3 个委托，24 小时后刷新
        </div>
        {!quests && <div className="farm-empty">任务卷轴展开中…</div>}
        {quests?.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <div key={q.id} className="quest-card">
              <div className="quest-head">
                <span className="quest-name">{q.name}</span>
                <span className="quest-type">
                  {TYPE_LABEL[q.type]} {q.progress}/{q.target}
                </span>
              </div>
              <div className="quest-bar">
                <div className="quest-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="quest-reward">
                奖励：💎{q.rewardStones} 灵石 · 📖{q.rewardExp} 修为
                {q.completed && (
                  <button className="btn-sell" disabled={busy} onClick={() => void claim(q)}>
                    领取
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button className="btn-plain" onClick={onClose} style={{ marginTop: 10 }}>
          关闭
        </button>
      </div>
    </div>
  );
}
