/* ══════════════════════════════════════════════════════════════════════════
   AttentionInbox (§4.7 · U3) — "16 agents, who needs me RIGHT NOW" as a single
   keyboard-driven queue. A right-edge slide-in over a --scrim.

   This IS a transient overlay surface, so it wears the tokenized .glass recipe
   (§13.2) — the one place in this workstream glass is allowed. Motion is the
   drawer binding (drawerMotion x-slide + scrimMotion fade, §12.5); reduced
   motion keeps the fade, drops the slide, via the root MotionConfig.

   Each item leads with a seat identity edge (§13.3, hue via the shared
   seatHueFor resolver) + a kind glyph (ask/confirm/choice/blocked/idle) + the
   session name + its age. Expanding an item:
     · ask/confirm/choice → the REAL Stage card renderer, so answering here goes
       through the exact same guarded respond() path as the dock (one response,
       explicit user action); the queue re-derives and drops the item.
     · blocked → a text reply written into the pane via resolve(id, answer).
     · idle-bell → go to the session, or dismiss it.
   Keyboard: J/K move · Enter expand (then answer) · Esc close. Empty = the quiet
   "All clear" state — an inbox at zero is a feature, not a blank.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { drawerMotion, scrimMotion, pressTap } from "../lib/motion";
import { useAttention, type AttentionItem, type AttentionKind } from "../store/attention";
import { useStage } from "../store/stage";
import { usePanes } from "../store/panes";
import { useModelHub } from "../store/modelhub";
import { seatHueFor } from "./BoardCard";
import { AskCard } from "./AskCard";
import { ChoiceCard } from "./ChoiceCard";
import { ConfirmCard } from "./ConfirmCard";
import { Icon, type IconName } from "./icons";
import type { StageWidget } from "../lib/contract";
import "../styles/attention.css";

const KIND_META: Record<
  AttentionKind,
  { icon: IconName; tone: "info" | "warn" | "err"; word: string }
> = {
  ask: { icon: "ic-pencil", tone: "info", word: "asking" },
  confirm: { icon: "ic-alert", tone: "info", word: "confirm" },
  choice: { icon: "ic-roster", tone: "info", word: "choose" },
  blocked: { icon: "ic-alert", tone: "err", word: "blocked" },
  "idle-bell": { icon: "ic-bell", tone: "warn", word: "waiting" },
};

function relAge(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** The matching Stage card for a widget-backed item; answering it uses the same
    guarded respond() path as the dock, and the queue prunes the item after. */
function InboxWidgetCard({ widget }: { widget: StageWidget }) {
  if (widget.type === "ask") return <AskCard widget={widget} />;
  if (widget.type === "choice") return <ChoiceCard widget={widget} />;
  if (widget.type === "confirm") return <ConfirmCard widget={widget} />;
  return null;
}

function BlockedReply({
  item,
  onDone,
}: {
  item: AttentionItem;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const send = () => {
    useAttention.getState().resolve(item.id, value);
    onDone();
  };
  return (
    <form
      className="ai-reply"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        ref={inputRef}
        className="ai-reply-input mono"
        value={value}
        placeholder="Reply to unblock — typed into the pane…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter is a newline. Stop the list's J/K/Enter nav.
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        spellCheck={false}
        rows={2}
      />
      <m.button type="submit" className="ai-btn primary" whileTap={pressTap}>
        Send
      </m.button>
    </form>
  );
}

function InboxItem({
  item,
  widget,
  hue,
  selected,
  expanded,
  now,
  onSelect,
  onToggle,
  onClose,
}: {
  item: AttentionItem;
  widget: StageWidget | undefined;
  hue: string | undefined;
  selected: boolean;
  expanded: boolean;
  now: number;
  onSelect: () => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  const meta = KIND_META[item.kind];
  const goToSession = () => {
    useAttention.getState().focusSession(item.sessionId);
    onClose();
  };
  const isWidget = item.widgetId !== undefined;

  return (
    <li
      className={`ai-item seat-edge${selected ? " selected" : ""}`}
      data-seat={hue}
      data-item-id={item.id}
      role="listitem"
    >
      <button type="button" className="ai-item-head" onClick={onToggle} onFocus={onSelect}>
        <span className={`ai-kind tone-${meta.tone}`}>
          <Icon name={meta.icon} size="sm" className="icon" />
        </span>
        <span className="ai-item-main">
          <span className="ai-item-title">{item.title}</span>
          {item.detail && <span className="ai-item-detail">{item.detail}</span>}
        </span>
        <span className="ai-item-meta">
          <span className={`ai-kind-word tone-${meta.tone}`}>{meta.word}</span>
          <span className="ai-item-age tnum">{relAge(item.ts, now)}</span>
        </span>
      </button>

      {expanded && (
        <div className="ai-item-body">
          {isWidget ? (
            widget && !widget.answered ? (
              <div className="ai-card-host">
                <InboxWidgetCard widget={widget} />
              </div>
            ) : (
              <div className="ai-gone">
                <span className="ai-gone-txt">This request is no longer waiting.</span>
                <button type="button" className="ai-btn" onClick={goToSession}>
                  Go to session
                </button>
              </div>
            )
          ) : item.kind === "blocked" ? (
            <>
              <BlockedReply item={item} onDone={onClose} />
              <button type="button" className="ai-link" onClick={goToSession}>
                <Icon name="ic-external" size="xs" className="icon" />
                Open the session
              </button>
            </>
          ) : (
            <div className="ai-idle-actions">
              <m.button
                type="button"
                className="ai-btn primary"
                onClick={goToSession}
                whileTap={pressTap}
              >
                Go to session
              </m.button>
              <button
                type="button"
                className="ai-btn"
                onClick={() => useAttention.getState().resolve(item.id)}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function InboxPanel({ onClose }: { onClose: () => void }) {
  const queue = useAttention((s) => s.queue);
  const widgets = useStage((s) => s.widgets);
  const seats = useModelHub((s) => s.seats);
  const panes = usePanes((s) => s.panes);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const widgetById = useMemo(() => {
    const map = new Map<string, StageWidget>();
    for (const w of widgets) map.set(w.id, w);
    return map;
  }, [widgets]);

  // Live ages while the drawer sits open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Keep the selection valid as the queue re-derives (items resolve, expire).
  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !queue.some((it) => it.id === selectedId)) {
      setSelectedId(queue[0].id);
    }
  }, [queue, selectedId]);

  const selectedIndex = Math.max(0, queue.findIndex((it) => it.id === selectedId));

  // Focus trap + J/K/Enter/Esc, mirroring the NotificationCenter idiom.
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = requestAnimationFrame(() =>
      dialogRef.current?.focus({ preventScroll: true }),
    );

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      const q = useAttention.getState().queue;
      if (q.length === 0) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedId((cur) => {
          const i = Math.max(0, q.findIndex((it) => it.id === cur));
          return q[Math.min(q.length - 1, i + 1)].id;
        });
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedId((cur) => {
          const i = Math.max(0, q.findIndex((it) => it.id === cur));
          return q[Math.max(0, i - 1)].id;
        });
      } else if (event.key === "Enter") {
        // Let the blocked-reply textarea own its own Enter (it stops propagation).
        event.preventDefault();
        setExpandedId((cur) => (cur === selectedId ? null : selectedId));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [onClose, selectedId]);

  // Scroll the selected row into view as J/K walks the queue.
  useEffect(() => {
    if (!selectedId || !dialogRef.current) return;
    dialogRef.current
      .querySelector(`[data-item-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, selectedIndex]);

  return (
    <m.div className="ai-scrim" onMouseDown={onClose} {...scrimMotion}>
      <m.div
        className="ai-panel glass"
        role="dialog"
        aria-modal="true"
        aria-label="Attention queue"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
        {...drawerMotion}
      >
        <header className="ai-head">
          <span className="ai-title">Attention</span>
          {queue.length > 0 && (
            <span className="ai-count tnum" aria-label={`${queue.length} waiting`}>
              {queue.length}
            </span>
          )}
          <button type="button" className="ai-close" aria-label="Close attention queue" onClick={onClose}>
            <Icon name="ic-close" size="sm" className="icon" />
          </button>
        </header>

        {queue.length === 0 ? (
          <div className="ai-empty">
            <Icon name="ic-check" className="icon ai-empty-ic" />
            <span className="ai-empty-title">All clear</span>
            <span className="ai-empty-sub">No agent is waiting on you.</span>
          </div>
        ) : (
          <ul className="ai-list" role="list" aria-label="Pending attention">
            {queue.map((item) => {
              const pane = panes[item.paneId];
              const hue = seatHueFor(pane?.model ?? pane?.agent, seats);
              return (
                <InboxItem
                  key={item.id}
                  item={item}
                  widget={item.widgetId ? widgetById.get(item.widgetId) : undefined}
                  hue={hue}
                  selected={selectedId === item.id}
                  expanded={expandedId === item.id}
                  now={now}
                  onSelect={() => setSelectedId(item.id)}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === item.id ? null : item.id))
                  }
                  onClose={onClose}
                />
              );
            })}
          </ul>
        )}
      </m.div>
    </m.div>
  );
}

/** Controlled overlay — U1 owns the open flag (rail badge / shortcut) + onClose.
    AnimatePresence lets the scrim + drawer animate their exit. */
export function AttentionInbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <InboxPanel onClose={onClose} />}</AnimatePresence>;
}
