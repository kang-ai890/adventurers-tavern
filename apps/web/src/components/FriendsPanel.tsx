import { useCallback, useEffect, useState } from "react";
import type { FriendsDto, VisitDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import {
  apiFriendAccept,
  apiFriendRemove,
  apiFriendRequest,
  apiFriends,
  apiGetPlayer,
  apiVisit,
  apiWater,
} from "../net/api";

/** 好友面板：好友列表 / 申请 / 拜访浇水 */
export function FriendsPanel({ onClose }: { onClose: () => void }) {
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [data, setData] = useState<FriendsDto | null>(null);
  const [ref, setRef] = useState("");
  const [visiting, setVisiting] = useState<VisitDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFriends());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "好友列表加载失败");
    }
  }, [setNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const notice = (msg: string) => {
    setNotice(msg);
    void load();
  };

  const add = async () => {
    if (!ref.trim() || busy) return;
    setBusy(true);
    try {
      await apiFriendRequest(ref.trim());
      notice("好友申请已发出");
      setRef("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusy(false);
    }
  };

  const accept = async (friendId: string) => {
    try {
      await apiFriendAccept(friendId);
      notice("已结为道侣好友！");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败");
    }
  };

  const remove = async (friendId: string) => {
    try {
      await apiFriendRemove(friendId);
      notice("已解除好友");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败");
    }
  };

  const visit = async (playerId: string) => {
    try {
      setVisiting(await apiVisit(playerId));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "拜访失败");
    }
  };

  const water = async (plotIndex: number) => {
    if (!visiting || busy) return;
    setBusy(true);
    try {
      const r = await apiWater(visiting.playerId, plotIndex);
      notice(`💧 浇水成功！作物生长加速 ${r.speedupPercent}%，得 ${r.rewardStones} 灵石，好感 +${r.affinityGained}`);
      setPlayer(await apiGetPlayer());
      setVisiting(await apiVisit(visiting.playerId));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "浇水失败");
    } finally {
      setBusy(false);
    }
  };

  const myId = player?.id;

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="friends-panel" onClick={(e) => e.stopPropagation()}>
        <h3>👥 道友录</h3>
        <div className="friend-add">
          <input
            className="login-input"
            style={{ marginBottom: 0, flex: 1 }}
            value={ref}
            placeholder="输入道号或玩家 ID 添加好友"
            maxLength={32}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
          />
          <button className="btn-sell" disabled={busy} onClick={() => void add()}>
            添加
          </button>
        </div>

        {!data ? (
          <div className="farm-empty">道友录翻阅中…</div>
        ) : (
          <>
            {data.pendingIn.length > 0 && (
              <div className="friend-group">
                <div className="friend-group-title">收到的申请</div>
                {data.pendingIn.map((p) => (
                  <div key={p.friendId} className="inv-row">
                    <span className="inv-name">{p.nickname}</span>
                    <button className="btn-sell" onClick={() => void accept(p.friendId)}>
                      同意
                    </button>
                  </div>
                ))}
              </div>
            )}
            {data.pendingOut.length > 0 && (
              <div className="friend-group">
                <div className="friend-group-title">发出的申请</div>
                {data.pendingOut.map((p) => (
                  <div key={p.friendId} className="inv-row">
                    <span className="inv-name">{p.nickname}</span>
                    <span className="inv-price">等待回应…</span>
                  </div>
                ))}
              </div>
            )}
            <div className="friend-group">
              <div className="friend-group-title">好友（{data.friends.length}）</div>
              {data.friends.length === 0 && <div className="farm-empty">还没有好友，去坊市交个朋友吧</div>}
              {data.friends.map((f) => (
                <div key={f.friendId} className="inv-row">
                  <span className="inv-name">{f.nickname}</span>
                  <span className="inv-price">
                    {f.realm} Lv.{f.level} · 亲密度 {f.affinity}
                  </span>
                  <button className="btn-sell" onClick={() => void visit(f.playerId)}>
                    拜访
                  </button>
                  <button className="btn-sell" onClick={() => void remove(f.friendId)}>
                    解除
                  </button>
                </div>
              ))}
            </div>
            {myId && <div className="login-hint">你的 ID：{myId.slice(0, 8)}…（好友可通过此 ID 精确找到你）</div>}
          </>
        )}
        <button className="btn-plain" onClick={onClose} style={{ marginTop: 10 }}>
          关闭
        </button>

        {/* 拜访视图 */}
        {visiting && (
          <div className="farm-modal">
            <div className="friends-panel">
              <h3>🏡 拜访 {visiting.nickname} 的领地</h3>
              <div className="login-hint">
                {visiting.realm} Lv.{visiting.level} · 口碑 Lv.{visiting.fameLevel} · 灵田 Lv.{visiting.farmLevel} · {visiting.season}季
              </div>
              <div className="plot-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                {visiting.plots.map((p) => (
                  <div key={p.plotIndex} className={`plot ${p.ready ? "plot-ready" : ""}`}>
                    {p.cropId ? (
                      <div className="plot-content">
                        <div className="plot-icon">{p.cropIcon}</div>
                        <div className="plot-name">{p.cropName}</div>
                        <div className="plot-time">
                          {p.ready ? "已成熟" : `今日已浇 ${p.waterCountToday}/5`}
                        </div>
                        {!p.ready && (
                          <button className="btn-sell" disabled={busy || p.waterCountToday >= 5} onClick={() => void water(p.plotIndex)}>
                            💧 浇水
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="plot-time">空地</div>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn-plain" onClick={() => setVisiting(null)} style={{ marginTop: 10 }}>
                返回
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
