import { useCallback, useEffect, useState } from "react";
import { CHECKIN_CYCLE, type DailyDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { apiCheckin, apiDaily, apiGetPlayer, apiTreasure } from "../net/api";

/** 每日福利：签到（7 天一轮）+ 寻宝罗盘（每日 3 次） */
export function DailyPanel({ onClose }: { onClose: () => void }) {
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [daily, setDaily] = useState<DailyDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDaily(await apiDaily());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "加载失败");
    }
  }, [setNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshPlayer = async () => {
    setPlayer(await apiGetPlayer());
  };

  const doCheckin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiCheckin();
      setNotice(
        `📅 签到第 ${r.day} 天！灵石 +${r.rewardStones}${r.rewardJades > 0 ? `，仙玉 +${r.rewardJades}！` : ""}（连续 ${r.streak} 天）`,
      );
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "签到失败");
    } finally {
      setBusy(false);
    }
  };

  const doTreasure = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiTreasure();
      setNotice(`🧭 ${r.text}`);
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "寻宝失败");
    } finally {
      setBusy(false);
    }
  };

  if (!daily) return <div className="farm-empty">翻开福利册…</div>;

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="daily-panel" onClick={(e) => e.stopPropagation()}>
        <h3>🎁 每日福利</h3>

        <div className="friend-group-title">📅 每日签到（已连续 {daily.streak} 天）</div>
        <div className="checkin-grid">
          {CHECKIN_CYCLE.map((r) => {
            const cycleProgress = daily.streak % 7;
            const done = cycleProgress === 0 ? daily.streak > 0 : r.day <= cycleProgress;
            const isNext = daily.dayOfCycle === r.day && !daily.checkedInToday;
            return (
              <div key={r.day} className={`checkin-day ${isNext ? "checkin-next" : ""} ${done ? "checkin-done" : ""}`}>
                <div className="checkin-day-num">第{r.day}天</div>
                <div className="checkin-reward">
                  💎{r.stones}
                  {r.jades > 0 && <> ✨{r.jades}</>}
                </div>
                <div className="checkin-mark">{done ? "✓" : isNext ? "待签" : ""}</div>
              </div>
            );
          })}
        </div>
        <button className="btn-primary" style={{ marginTop: 10 }} disabled={busy || daily.checkedInToday} onClick={() => void doCheckin()}>
          {daily.checkedInToday ? "今日已签到，明日再来" : `签到（第 ${daily.dayOfCycle} 天奖励）`}
        </button>

        <div className="friend-group-title" style={{ marginTop: 16 }}>
          🧭 寻宝罗盘（今日剩余 {daily.treasureLeft}/3 次）
        </div>
        <div className="login-hint" style={{ textAlign: "left" }}>
          野外罗盘寻宝：可挖到灵石、仙玉、作物种子或稀有材料
        </div>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || daily.treasureLeft <= 0} onClick={() => void doTreasure()}>
          {daily.treasureLeft > 0 ? "🧭 开始寻宝" : "今日次数已用完"}
        </button>

        <div>
          <button className="btn-plain" onClick={onClose} style={{ marginTop: 12 }}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
