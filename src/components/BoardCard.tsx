/* ══════════════════════════════════════════════════════════════════════════
   BoardCard — one kanban card (DESIGN.md v4: T1 raised + §13.3 seat identity).

   Identity vs state, kept separate per §4.4/§4.5:
     · identity = the seat: 2px left .seat-edge strip + a .seat-chip (dot + the
       seat WORD), hue via [data-seat]. Never color alone, never merged with state.
     · state    = the column the card sits in (positional) + a warning "blocked"
       flag (icon + word) when the latest receipt is task.blocked.

   seatHueFor() is the shared seat-name → DESIGN-seat-hue resolver (board cards
   AND the swarm mission tree consume it, so both surfaces color a seat the same
   way): exact DESIGN seat names pass through; Model Hub seat names resolve
   through their pinned model; unknowns fall back to the neutral generic tier.
   ══════════════════════════════════════════════════════════════════════════ */
import type { DragEvent, KeyboardEvent } from "react";
import { useModelHub } from "../store/modelhub";
import type { Card, CardStatus } from "../store/board";
import { Icon } from "./icons";

/** The eight §4.4 seat hues that [data-seat] binds in global.css. */
const DESIGN_SEATS = [
  "claude", "gpt", "kimi", "sonnet",
  "custom-1", "custom-2", "custom-3", "custom-4",
] as const;

/** Column display names (brief wording; the store's column ids are canonical). */
export const STATUS_WORD: Record<CardStatus, string> = {
  todo: "To do",
  doing: "In progress",
  review: "In review",
  done: "Done",
};

/** Resolve any seat reference (DESIGN seat name, Model Hub seat name, or a raw
    model id) to one of the eight DESIGN seat hues. undefined = generic grey. */
export function seatHueFor(
  seat: string | undefined,
  seats: Record<string, string>,
): string | undefined {
  if (!seat) return undefined;
  const name = seat.trim();
  if (!name) return undefined;
  if ((DESIGN_SEATS as readonly string[]).includes(name)) return name;
  // Model Hub seat name → its pinned model; a raw model id resolves against itself.
  const model = (seats[name] ?? name).toLowerCase();
  if (model.includes("kimi")) return "kimi";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("gpt") || model.includes("codex") || /\bo[0-9]/.test(model)) return "gpt";
  if (model.includes("claude") || model.includes("opus") || model === "") return "claude";
  return undefined;
}

const DOT_CAP = 5;

export function BoardCard({
  card,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  dragging: boolean;
  onOpen: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
}) {
  const seats = useModelHub((s) => s.seats);
  const hue = seatHueFor(card.seat, seats);
  const lastEvent = card.timeline[card.timeline.length - 1];
  const blocked = card.status === "doing" && lastEvent?.kind === "blocked";
  const events = card.timeline.length;
  const shownDots = Math.min(events, DOT_CAP);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Arrow navigation is delegated to the board container (it owns the map).
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onOpen(card.id);
    }
  };

  return (
    <div
      className={`board-card elev-1${hue ? " seat-edge" : ""}${dragging ? " dragging" : ""}`}
      data-seat={hue}
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      aria-label={`${card.title}. ${STATUS_WORD[card.status]}. ${events} timeline event${events === 1 ? "" : "s"}${blocked ? ". Blocked" : ""}`}
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(card.id)}
      onKeyDown={onKeyDown}
    >
      <div className="board-card-title">{card.title}</div>

      {(card.seat || blocked) && (
        <div className="board-card-meta">
          {card.seat && (
            <span className="seat-chip board-card-seat">
              <i className="seat-dot" aria-hidden="true" />
              <span className="board-card-seat-word">{card.seat}</span>
            </span>
          )}
          {blocked && (
            <span className="board-card-flag">
              <Icon name="ic-alert" size="xs" className="icon" />
              blocked
            </span>
          )}
        </div>
      )}

      <div className="board-card-foot">
        <span className="board-card-status">{STATUS_WORD[card.status]}</span>
        <span className="board-card-dots" aria-hidden="true">
          {Array.from({ length: shownDots }, (_, i) => (
            <i key={i} className="board-card-dot" />
          ))}
          {events > DOT_CAP && <span className="board-card-more tnum">+{events - DOT_CAP}</span>}
        </span>
      </div>
    </div>
  );
}
