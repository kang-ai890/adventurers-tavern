import { useEffect, useState } from "react";
import type { TavernDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { apiGetPlayer, apiServeOrder, apiTavern } from "../net/api";

/** 酒馆顾客区（内嵌于领地面板） */
export function TavernSection() {
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [tavern, setTavern] = useState<TavernDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setTavern(await apiTavern());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "酒馆加载失败");
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000); // 顾客会陆续到店
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serve = async (orderId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiServeOrder(orderId);
      setNotice(`🍽️ 招待 ${r.customerName}：${r.itemName} ×${r.quantity}，入账 ${r.stonesGained} 灵石${r.levelUps > 0 ? "，修为大涨！" : ""}`);
      setPlayer(await apiGetPlayer());
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "招待失败");
    } finally {
      setBusy(false);
    }
  };

  if (!tavern) return <div className="farm-empty">酒馆账本翻找中…</div>;

  const revenuePct = tavern.revenueToNext === null ? 100 : Math.min(100, Math.round((tavern.totalRevenue / tavern.revenueToNext) * 100));

  return (
    <div>
      <div className="tavern-head">
        <span>
          ⭐ 口碑 Lv.{tavern.fameLevel} · 客流 {tavern.customersPerHour}人/时 · 客单价 {tavern.avgSpend} 灵石
        </span>
        <span className="inv-price">
          {tavern.revenueToNext === null
            ? `累计营业额 ${tavern.totalRevenue}（满级）`
            : `下一级还需 ${tavern.revenueToNext - tavern.totalRevenue} 营业额`}
        </span>
      </div>
      <div className="quest-bar" style={{ marginBottom: 10 }}>
        <div className="quest-bar-fill" style={{ width: `${revenuePct}%` }} />
      </div>
      {tavern.orders.length === 0 ? (
        <div className="farm-empty">暂无客人，稍等片刻（每小时来 {tavern.customersPerHour} 位）</div>
      ) : (
        <div className="inv-list">
          {tavern.orders.map((o) => (
            <div key={o.id} className="inv-row">
              <span className="inv-icon">{o.itemIcon}</span>
              <span className="inv-name">{o.customerName}</span>
              <span className="inv-qty">
                点单：{o.itemName} ×{o.quantity}
              </span>
              <span className="inv-price">💰{o.price}</span>
              <span className="inv-price">背包 {o.have}</span>
              <button className="btn-sell" disabled={busy || o.have < o.quantity} onClick={() => void serve(o.id)}>
                招待
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
