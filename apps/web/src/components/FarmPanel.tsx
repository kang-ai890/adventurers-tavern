import { useEffect, useState } from "react";
import { CROPS, cropCanPlantInSeason, type CropDef, type EventPendingDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import {
  apiGetFarm,
  apiGetPlayer,
  apiHarvest,
  apiPlant,
  apiSell,
  apiUpgradeFarm,
} from "../net/api";
import { EventModal } from "./EventModal";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "操作失败";
}

/** 剩余时间格式化 */
function fmtRemain(ms: number): string {
  if (ms <= 0) return "已成熟";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function FarmPanel({ onClose }: { onClose: () => void }) {
  const player = useGameStore((s) => s.player);
  const farm = useGameStore((s) => s.farm);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setFarm = useGameStore((s) => s.setFarm);
  const setNotice = useGameStore((s) => s.setNotice);

  const [now, setNow] = useState(() => Date.now());
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<EventPendingDto | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = async () => {
    const [p, f] = await Promise.all([apiGetPlayer(), apiGetFarm()]);
    setPlayer(p);
    setFarm(f);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setNotice(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!farm || !player) {
    return (
      <div className="farm-panel">
        <div className="farm-empty">加载领地中…</div>
      </div>
    );
  }

  const building = farm.buildings.find((b) => b.type === "farm");
  const canAffordUpgrade = building && building.upgradeCost !== null && player.stones >= building.upgradeCost;

  return (
    <div className="farm-panel">
      <div className="farm-header">
        <div className="farm-title">
          🏡 {player.nickname} 的领地
          <span className="farm-sub">
            灵田 Lv.{farm.farmLevel} · {farm.season}季 · 地块 {farm.plots.filter((p) => p.cropId).length}/{farm.plotCount}
          </span>
        </div>
        <button className="btn-plain" onClick={onClose}>
          ✕ 回坊市
        </button>
      </div>

      <div className="farm-body">
        {/* 灵田 */}
        <div className="farm-section">
          <h3>🌱 灵田</h3>
          <div className="plot-grid">
            {farm.plots.map((plot) => {
              const remaining = plot.readyAt ? new Date(plot.readyAt).getTime() - now : 0;
              return (
                <div key={plot.plotIndex} className={`plot ${plot.ready ? "plot-ready" : ""}`}>
                  {plot.cropId ? (
                    <div className="plot-content">
                      <div className="plot-icon">{plot.cropIcon}</div>
                      <div className="plot-name">{plot.cropName}</div>
                      <div className="plot-time">{fmtRemain(remaining)}</div>
                      {plot.ready && (
                        <button
                          className="btn-primary btn-small"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const r = await apiHarvest(plot.plotIndex);
                              setNotice(
                                `收获 ${r.cropName} ×${r.quantity}，修为 +${r.expGained}${
                                  r.levelUps > 0 ? `，突破至 ${r.newLevel} 级（${r.newRealm}）！` : ""
                                }`,
                              );
                              if (r.pendingEvent) setPendingEvent(r.pendingEvent);
                            })
                          }
                        >
                          🌾 收获！
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="plot-empty"
                      disabled={busy}
                      onClick={() => setPickerFor(plot.plotIndex)}
                    >
                      ＋<br />
                      种植
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 建筑 */}
        <div className="farm-section">
          <h3>🏗️ 建筑</h3>
          {building && (
            <div className="building-card">
              <div>
                <b>灵田</b> Lv.{building.level}/{building.maxLevel} · {building.effect}
              </div>
              {building.upgradeCost !== null ? (
                <button
                  className="btn-primary btn-small"
                  disabled={busy || !canAffordUpgrade || player.level < (building.upgradeUnlockLevel ?? 0)}
                  onClick={() =>
                    run(async () => {
                      const r = await apiUpgradeFarm();
                      setNotice(`灵田扩建至 Lv.${r.newLevel}，新开垦 ${r.newPlotCount} 块地！`);
                    })
                  }
                >
                  扩建 {building.upgradeCost} 灵石
                </button>
              ) : (
                <span className="farm-max">已满级</span>
              )}
            </div>
          )}
        </div>

        {/* 背包 */}
        <div className="farm-section">
          <h3>🎒 背包</h3>
          {farm.inventory.length === 0 ? (
            <div className="farm-empty">空空如也，去收获点作物吧</div>
          ) : (
            <div className="inv-list">
              {farm.inventory.map((row) => (
                <div key={row.itemId} className="inv-row">
                  <span className="inv-icon">{row.icon}</span>
                  <span className="inv-name">{row.name}</span>
                  <span className="inv-qty">×{row.quantity}</span>
                  <span className="inv-price">单价 {row.price} 灵石</span>
                  <button
                    className="btn-sell"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await apiSell(row.itemId, row.quantity);
                        setNotice(`售出 ${row.name} ×${r.quantity}，入账 ${r.stonesGained} 灵石`);
                      })
                    }
                  >
                    全部出售
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 选种弹层 */}
      {pickerFor !== null && (        <div className="farm-modal" onClick={() => setPickerFor(null)}>
          <div className="crop-picker" onClick={(e) => e.stopPropagation()}>
            <h3>选择作物（种在第 {pickerFor + 1} 块地）</h3>
            <div className="crop-list">
              {CROPS.map((crop: CropDef) => {
                const levelLocked = player.level < crop.unlockLevel;
                const seasonLocked = !cropCanPlantInSeason(crop, farm.season);
                const affordable = player.stones >= crop.seedCost;
                return (
                  <button
                    key={crop.id}
                    className={`crop-card ${levelLocked || seasonLocked ? "crop-locked" : ""}`}
                    disabled={busy || levelLocked || seasonLocked || !affordable}
                    onClick={() =>
                      run(async () => {
                        const r = await apiPlant(pickerFor, crop.id);
                        setNotice(`种下 ${r.cropName}（种子 ${r.seedCost} 灵石）`);
                        setPickerFor(null);
                      })
                    }
                  >
                    <div className="crop-icon">{crop.icon}</div>
                    <div className="crop-name">{crop.name}</div>
                    <div className="crop-info">
                      {crop.growMinutes}分 · 种子{crop.seedCost} · 产{crop.yieldCount}×{crop.sellPrice}灵石 · 修为{crop.exp}
                    </div>
                    <div className="crop-lock-info">
                      {levelLocked
                        ? `Lv.${crop.unlockLevel} 解锁`
                        : seasonLocked
                          ? `${crop.seasons.join("/")}季限定`
                          : !affordable
                            ? "灵石不足"
                            : "点击种植"}
                    </div>
                  </button>
                );
              })}
            </div>
            <button className="btn-plain" onClick={() => setPickerFor(null)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 奇遇事件弹窗 */}
      {pendingEvent && (
        <EventModal event={pendingEvent} onClose={() => setPendingEvent(null)} />
      )}
    </div>
  );
}
