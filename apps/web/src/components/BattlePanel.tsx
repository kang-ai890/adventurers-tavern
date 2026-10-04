import { useCallback, useEffect, useState } from "react";
import type { BattleResultDto, DungeonDto, HeroesDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import {
  apiBattle,
  apiDungeons,
  apiEquip,
  apiGetPlayer,
  apiHeroLevelUp,
  apiHeroes,
  apiRecruit,
  apiUnequip,
} from "../net/api";

/** 历练面板：冒险者队伍 / 招募 / 副本自动战斗 */
export function BattlePanel({ onClose }: { onClose: () => void }) {
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setNotice = useGameStore((s) => s.setNotice);
  const [data, setData] = useState<HeroesDto | null>(null);
  const [dungeons, setDungeons] = useState<DungeonDto[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [battleResult, setBattleResult] = useState<BattleResultDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, d] = await Promise.all([apiHeroes(), apiDungeons()]);
      setData(h);
      setDungeons(d);
      setSelected((prev) => {
        const ids = new Set(h.heroes.map((x) => x.id));
        const kept = new Set([...prev].filter((id) => ids.has(id)));
        if (kept.size === 0 && h.heroes.length > 0) kept.add(h.heroes[0].id);
        return kept;
      });
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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        if (next.size >= 3) {
          setNotice("最多 3 人出战");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const recruit = async (currency: "stones" | "jades") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiRecruit(currency);
      setNotice(
        r.currency === "stones"
          ? `🏮 招募成功：${r.hero.icon} ${r.hero.name}（${r.hero.star}星 ${r.hero.job}）！花费 ${r.cost} 灵石`
          : `✨ 仙玉招募：${r.hero.icon} ${r.hero.name}（${r.hero.star}星 ${r.hero.job}）！花费 ${r.cost} 仙玉`,
      );
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "招募失败");
    } finally {
      setBusy(false);
    }
  };

  const levelUp = async (heroId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const h = await apiHeroLevelUp(heroId);
      setNotice(`${h.icon} ${h.name} 升至 Lv.${h.level}，战力 ${h.power}！`);
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "升级失败");
    } finally {
      setBusy(false);
    }
  };

  const equip = async (equipmentId: string, heroId: string) => {
    try {
      await apiEquip(equipmentId, heroId);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "装备失败");
    }
  };

  const unequip = async (equipmentId: string) => {
    try {
      await apiUnequip(equipmentId);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "卸下失败");
    }
  };

  const fight = async (dungeonId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiBattle(dungeonId, [...selected]);
      setBattleResult(r);
      setNotice(r.success ? `⚔️ 通关【${r.dungeonName}】！修为 +${r.expGained}` : `【${r.dungeonName}】挑战失败，修为 +${r.expGained}`);
      await refreshPlayer();
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "出征失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data || !dungeons) return <div className="farm-empty">整理队伍中…</div>;

  const teamPower = dungeons[0]?.teamPower ?? 0;

  return (
    <div className="farm-modal" onClick={onClose}>
      <div className="battle-panel" onClick={(e) => e.stopPropagation()}>
        <h3>⚔️ 历练（我方最强战力 {teamPower}）</h3>

        <div className="friend-group-title">冒险者（点击头像选人出战，最多 3 人）</div>
        <div className="hero-list">
          {data.heroes.map((h) => (
            <div key={h.id} className={`hero-card ${selected.has(h.id) ? "hero-selected" : ""}`} onClick={() => toggle(h.id)}>
              <div className="hero-icon">{h.icon}</div>
              <div className="hero-name">
                {h.name} <span className="hero-star">{"★".repeat(h.star)}</span>
              </div>
              <div className="hero-job">{h.job} Lv.{h.level}</div>
              <div className="hero-stats">
                攻{h.atk} 防{h.def} 血{h.hp}
              </div>
              <div className="hero-power">战力 {h.power}</div>
              <div className="hero-actions">
                <button
                  className="btn-sell"
                  disabled={busy || (player ? h.level >= player.level : false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    void levelUp(h.id);
                  }}
                >
                  升级（{h.level * 50} 灵石）
                </button>
              </div>
              {h.equipment.length > 0 && (
                <div className="hero-equip">
                  {h.equipment.map((eq) => (
                    <span
                      key={eq.id}
                      className="equip-chip"
                      style={{ color: eq.qualityColor }}
                      title={`${eq.qualityLabel}${eq.slot === "weapon" ? "武器" : eq.slot === "armor" ? "衣袍" : "饰品"} 攻${eq.atk}防${eq.def}血${eq.hp}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void unequip(eq.id);
                      }}
                    >
                      {eq.slot === "weapon" ? "⚔️" : eq.slot === "armor" ? "🛡️" : "💍"}
                      {eq.qualityLabel}（点卸下）
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="friend-group-title" style={{ marginTop: 10 }}>
          背包装备（点装备给选中的冒险者）
        </div>
        <div className="hero-equip">
          {data.bag.length === 0 && <span className="inv-price">暂无装备，去副本掉落吧</span>}
          {data.bag.map((eq) => (
            <button
              key={eq.id}
              className="equip-chip"
              style={{ color: eq.qualityColor, cursor: "pointer" }}
              disabled={selected.size === 0}
              onClick={() => void equip(eq.id, [...selected][0])}
            >
              {eq.slot === "weapon" ? "⚔️" : eq.slot === "armor" ? "🛡️" : "💍"}
              {eq.qualityLabel}（攻{eq.atk}防{eq.def}血{eq.hp}）
            </button>
          ))}
        </div>

        <div className="friend-group-title" style={{ marginTop: 10 }}>
          招募（灵石 2~4星；仙玉 3~5星）
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-sell" disabled={busy} onClick={() => void recruit("stones")}>
            🏮 灵石招募（500）
          </button>
          <button className="btn-sell" disabled={busy} onClick={() => void recruit("jades")}>
            ✨ 仙玉招募（50）
          </button>
        </div>

        <div className="friend-group-title" style={{ marginTop: 12 }}>
          副本（自动战斗，消耗体力）
        </div>
        <div className="inv-list">
          {dungeons.map((d) => (
            <div key={d.id} className="inv-row" style={{ opacity: d.unlocked ? 1 : 0.5 }}>
              <span className="inv-icon">{d.icon}</span>
              <span className="inv-name">{d.name}</span>
              <span className="inv-price">
                推荐战力 {d.recommendedPower} · 体力 {d.energyCost} · 修为 {d.expReward}
              </span>
              <button
                className="btn-sell"
                disabled={busy || !d.unlocked || selected.size === 0}
                onClick={() => void fight(d.id)}
              >
                {d.unlocked ? "出战" : `需 ${d.unlockLevel} 级`}
              </button>
            </div>
          ))}
        </div>

        <button className="btn-plain" onClick={onClose} style={{ marginTop: 12 }}>
          关闭
        </button>

        {battleResult && (
          <div className="farm-modal">
            <div className="event-panel">
              <div className="event-title">{battleResult.success ? "🎉 通关！" : "💀 败北"}</div>
              <div className="battle-log">
                {battleResult.log.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              <div className="event-effects">
                <div className="event-effect">
                  修为：<b>+{battleResult.expGained}</b>（{battleResult.levelUps > 0 ? `升至 ${battleResult.newLevel} 级！` : `Lv.${battleResult.newLevel}`}）
                </div>
                <div className="event-effect">
                  灵石：<b>+{battleResult.stonesGained}</b> · 体力剩余 <b>{battleResult.energyLeft}</b>
                </div>
                {battleResult.loot.map((l, i) => (
                  <div key={i} className="event-effect">
                    掉落：<b>{l.icon} {l.name} ×{l.quantity}</b>
                  </div>
                ))}
                {battleResult.equipment && (
                  <div className="event-effect">
                    装备：<b style={{ color: battleResult.equipment.qualityColor }}>{battleResult.equipment.qualityLabel}</b>
                  </div>
                )}
                {battleResult.fragment && (
                  <div className="event-effect">
                    稀有：<b>{battleResult.fragment.icon} {battleResult.fragment.name}</b>
                  </div>
                )}
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setBattleResult(null)}>
                知道了
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
