import { useState } from "react";
import type { EventPendingDto, EventResolveResultDto } from "@tavern/shared";
import { useGameStore } from "../store/useGameStore";
import { apiGetFarm, apiGetPlayer, apiResolveEvent } from "../net/api";

/** 奇遇事件弹窗：二选一分支 */
export function EventModal({
  event,
  onClose,
}: {
  event: EventPendingDto;
  onClose: () => void;
}) {
  const setPlayer = useGameStore((s) => s.setPlayer);
  const setFarm = useGameStore((s) => s.setFarm);
  const setNotice = useGameStore((s) => s.setNotice);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EventResolveResultDto | null>(null);

  const choose = async (option: "A" | "B") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiResolveEvent(event.eventId, option);
      setResult(r);
      setPlayer(await apiGetPlayer());
      setFarm(await apiGetFarm());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "事件已失效");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="farm-modal">
      <div className="event-panel">
        {!result ? (
          <>
            <div className="event-title">⚡ {event.title}</div>
            <div className="event-text">{event.text}</div>
            <div className="event-options">
              <button className="event-option" disabled={busy} onClick={() => void choose("A")}>
                <b>{event.options.A.label}</b>
                <span>{event.options.A.description}</span>
              </button>
              <button className="event-option" disabled={busy} onClick={() => void choose("B")}>
                <b>{event.options.B.label}</b>
                <span>{event.options.B.description}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="event-title">⚡ {result.title}</div>
            <div className="event-text">{result.text}</div>
            {result.effects.length > 0 && (
              <div className="event-effects">
                {result.effects.map((fx, i) => (
                  <div key={i} className="event-effect">
                    {fx.label}：<b>{fx.value}</b>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn-primary"
              onClick={() => {
                setNotice(`${result.title}：${result.text}`);
                onClose();
              }}
              style={{ marginTop: 12 }}
            >
              知道了
            </button>
          </>
        )}
      </div>
    </div>
  );
}
