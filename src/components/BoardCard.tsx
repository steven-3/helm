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

   Card actions live behind a hover/focus-revealed kebab in the card foot:
   a transient glass menu (§13.2 sanctions glass on menus) carrying the one
   destructive verb — Delete, behind an inline two-step confirm (no browser
   confirm()); the store's removeCard strips the card from its column, and an
   open receipt drawer on the deleted card closes itself (BoardView watches
   the cards map). The menu is position:fixed because the column body scrolls
   (overflow clips absolute popovers) — same reason the seat picker is fixed.
   ══════════════════════════════════════════════════════════════════════════ */
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useModelHub } from "../store/modelhub";
import { useBoard, type Card, type CardStatus } from "../store/board";
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

  /* ── kebab menu (delete) ─────────────────────────────────────────────────── */
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuPos(null);
    setConfirming(false);
    if (restoreFocus) kebabRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    const rect = kebabRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_W = 184;
    setConfirming(false);
    setMenuPos({
      x: Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8)),
      y: Math.min(rect.bottom + 4, window.innerHeight - 132),
    });
  }, []);

  /* Dismiss on outside click / Escape (the seat-picker pattern). */
  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || kebabRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuPos, closeMenu]);

  /* Keyboard-first: focus the destructive item on open, the confirm on arm. */
  useEffect(() => {
    if (menuPos) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menuPos, confirming]);

  const deleteCard = useCallback(() => {
    useBoard.getState().removeCard(card.id);
    closeMenu();
  }, [card.id, closeMenu]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Arrow navigation is delegated to the board container (it owns the map).
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onOpen(card.id);
    }
  };

  const onCardDragStart = (e: DragEvent<HTMLDivElement>) => {
    // The kebab/menu must open, never start a card drag (the .tclose guard).
    if ((e.target as HTMLElement).closest(".board-card-kebab,.board-card-menu")) {
      e.preventDefault();
      return;
    }
    onDragStart(e, card.id);
  };

  const onMenuMouseDown = (e: ReactMouseEvent) => e.stopPropagation();

  return (
    <div
      className={`board-card elev-1${hue ? " seat-edge" : ""}${dragging ? " dragging" : ""}`}
      data-seat={hue}
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      aria-label={`${card.title}. ${STATUS_WORD[card.status]}. ${events} timeline event${events === 1 ? "" : "s"}${blocked ? ". Blocked" : ""}`}
      draggable
      onDragStart={onCardDragStart}
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
        <button
          ref={kebabRef}
          type="button"
          className="board-card-kebab"
          aria-label={`More actions for ${card.title}`}
          aria-haspopup="menu"
          aria-expanded={menuPos !== null}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (menuPos) closeMenu();
            else openMenu();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={onMenuMouseDown}
        >
          <Icon name="ic-more" size="sm" className="icon" />
        </button>
      </div>

      {menuPos && (
        <div
          ref={menuRef}
          className="board-card-menu glass"
          style={{ left: menuPos.x, top: menuPos.y }}
          role="menu"
          aria-label={`Actions for ${card.title}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={onMenuMouseDown}
        >
          {confirming ? (
            <div className="board-card-menu-confirm" role="group" aria-label="Confirm delete">
              <span className="board-card-menu-q">Delete this card?</span>
              <div className="board-card-menu-row">
                <button type="button" className="board-card-menu-yes" onClick={deleteCard}>
                  <Icon name="ic-check" size="xs" className="icon" />
                  Delete
                </button>
                <button
                  type="button"
                  className="board-card-menu-no"
                  aria-label="Cancel delete"
                  onClick={() => closeMenu(true)}
                >
                  <Icon name="ic-close" size="xs" className="icon" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="board-card-menu-item danger"
              onClick={() => setConfirming(true)}
            >
              <Icon name="ic-trash" size="sm" className="icon" />
              Delete card
            </button>
          )}
        </div>
      )}
    </div>
  );
}
