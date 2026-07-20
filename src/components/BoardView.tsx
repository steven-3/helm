/* ══════════════════════════════════════════════════════════════════════════
   BoardView — the kanban control surface (§4.4 + §5.1 dispatch receipts).

   Full-bleed center surface (mounted by the shell where the terminal grid
   renders). Four fixed columns fed by useBoard; cards move by HTML5 drag-drop
   or keyboard; dropping a card into "In progress" offers dispatch through a
   seat-picker popover (seats from useModelHub → dispatchCard, §3.5). Click /
   Enter opens the receipt drawer: markdown body (MdCard consumed read-only,
   chrome stripped in board.css), the full timeline, pane deep-link
   (useBoard.focusCard → revealPane), a "Move to" select (keyboard/touch parity
   for drag), and the review column's working-tree stat via useGit (shown only
   when git tracks THIS project root).

   Project root: explorer override ?? active pane cwd (the FilesView pattern;
   the workspace store carries topology, no project path).
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { m, AnimatePresence } from "motion/react";
import { useBoard, BOARD_COLUMNS, type CardStatus, type TimelineEvent } from "../store/board";
import { useExplorer } from "../store/explorer";
import { usePanes } from "../store/panes";
import { useModelHub } from "../store/modelhub";
import { useGit } from "../store/git";
import { menuMotion, drawerMotion, pressTap } from "../lib/motion";
import { MdCard } from "./MdCard";
import { Icon, type IconName } from "./icons";
import { BoardCard, STATUS_WORD, seatHueFor } from "./BoardCard";
import "../styles/board.css";

/* ── timeline receipt glyphs: kind → icon + tone (state, never color alone) ── */
const EVENT_VIS: Record<string, { icon: IconName; tone: "info" | "success" | "warning" | "muted" }> = {
  created: { icon: "ic-plus", tone: "muted" },
  dispatch: { icon: "ic-play", tone: "info" },
  progress: { icon: "ic-progress", tone: "info" },
  blocked: { icon: "ic-alert", tone: "warning" },
  done: { icon: "ic-check", tone: "success" },
  moved: { icon: "ic-chev", tone: "muted" },
  note: { icon: "ic-info", tone: "muted" },
};
const eventVis = (kind: string) => EVENT_VIS[kind] ?? { icon: "ic-info", tone: "muted" as const };

const fmtTs = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

interface DropTarget {
  columnId: CardStatus;
  index: number;
}

interface PickerState {
  cardId: string;
  x: number;
  y: number;
}

export function BoardView() {
  /* project root: explicit explorer location wins; else follow the active pane. */
  const paneCwd = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return (tab && s.panes[tab.activePaneId]?.cwd) || null;
  });
  const explorerRoot = useExplorer((s) => s.root);
  const root = explorerRoot ?? paneCwd;

  const columns = useBoard((s) => s.columns);
  const cards = useBoard((s) => s.cards);
  const loaded = useBoard((s) => s.loaded);
  const boardRoot = useBoard((s) => s.root);

  const seats = useModelHub((s) => s.seats);
  const gitStatus = useGit((s) => s.status);
  const gitCwd = useGit((s) => s.cwd);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  /* Bind the store to the live project root. */
  useEffect(() => {
    if (root && root !== boardRoot) void useBoard.getState().load(root);
  }, [root, boardRoot]);

  const openCard = openCardId ? cards[openCardId] : undefined;
  useEffect(() => {
    if (openCardId && !openCard) setOpenCardId(null);
  }, [openCardId, openCard]);

  /* Dismiss the seat picker on outside click / Escape. */
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPicker(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [picker]);

  /* Focus the first seat option when the picker opens (keyboard-first). */
  useEffect(() => {
    if (picker) pickerRef.current?.querySelector<HTMLButtonElement>("button.board-pick-seat")?.focus();
  }, [picker]);

  const totalCards = useMemo(() => Object.keys(cards).length, [cards]);

  /* ── drag & drop ─────────────────────────────────────────────────────────── */
  const onCardDragStart = useCallback((e: DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
    setError(null);
  }, []);

  const clearDrag = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  const onColumnDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, columnId: CardStatus) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const body = e.currentTarget;
      const siblings = Array.from(
        body.querySelectorAll<HTMLElement>("[data-card-id]"),
      ).filter((el) => el.dataset.cardId !== dragId);
      let index = siblings.length;
      for (let i = 0; i < siblings.length; i++) {
        const rect = siblings[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          index = i;
          break;
        }
      }
      setDropTarget((prev) =>
        prev && prev.columnId === columnId && prev.index === index ? prev : { columnId, index },
      );
    },
    [dragId],
  );

  const onColumnDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, columnId: CardStatus) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      const index = dropTarget?.columnId === columnId ? dropTarget.index : undefined;
      clearDrag();
      if (!id) return;
      const card = useBoard.getState().cards[id];
      if (!card) return;
      const crosses = card.status !== columnId;
      useBoard.getState().moveCard(id, columnId, index);
      // §3.5: landing in "In progress" without a live pane offers dispatch.
      if (columnId === "doing" && crosses && !card.paneId) {
        const x = Math.min(e.clientX, window.innerWidth - 260);
        const y = Math.min(e.clientY, window.innerHeight - 320);
        setPicker({ cardId: id, x: Math.max(8, x), y: Math.max(8, y) });
      }
    },
    [dragId, dropTarget, clearDrag],
  );

  /* ── dispatch ────────────────────────────────────────────────────────────── */
  const dispatchWithSeat = useCallback(async (cardId: string, seat: string) => {
    setDispatching(true);
    setError(null);
    useBoard.getState().updateCard(cardId, { seat });
    const receipt = await useBoard.getState().dispatchCard(cardId);
    setDispatching(false);
    setPicker(null);
    if (!receipt) {
      const title = useBoard.getState().cards[cardId]?.title ?? "card";
      setError(`Dispatch failed for "${title}". The receipt is on the card's timeline.`);
    }
  }, []);

  /* ── composer ────────────────────────────────────────────────────────────── */
  const submitComposer = useCallback(() => {
    const title = draftTitle.trim();
    if (!title) return;
    useBoard.getState().addCard({ title, body: draftBody });
    setDraftTitle("");
    setDraftBody("");
    setComposing(false);
  }, [draftTitle, draftBody]);

  /* ── keyboard: arrows between cards (roving via DOM order) ───────────────── */
  const onViewKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-card-id]");
    if (!el || !viewRef.current) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const columnEl = el.closest<HTMLElement>("[data-column-id]");
    if (!columnEl) return;
    const columnIds = BOARD_COLUMNS.map((c) => c.id);
    const colIdx = columnIds.indexOf(columnEl.dataset.columnId as CardStatus);
    const cardEls = Array.from(columnEl.querySelectorAll<HTMLElement>("[data-card-id]"));
    const cardIdx = cardEls.indexOf(el);

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const next = cardEls[e.key === "ArrowUp" ? cardIdx - 1 : cardIdx + 1];
      next?.focus();
      return;
    }
    const targetColIdx = e.key === "ArrowLeft" ? colIdx - 1 : colIdx + 1;
    const targetId = columnIds[targetColIdx];
    if (!targetId) return;
    const targetCol = viewRef.current.querySelector<HTMLElement>(`[data-column-id="${targetId}"]`);
    const targetCards = targetCol
      ? Array.from(targetCol.querySelectorAll<HTMLElement>("[data-card-id]"))
      : [];
    (targetCards[Math.min(cardIdx, targetCards.length - 1)] ?? null)?.focus();
  }, []);

  /* ── no project root: the quiet empty state ──────────────────────────────── */
  if (!root) {
    return (
      <div className="board-view" ref={viewRef}>
        <div className="board-empty">
          <Icon name="ic-folder" className="icon" />
          <div className="board-empty-title">No project folder</div>
          <div className="board-empty-sub">
            The board lives in a project's <code>.helm/board.json</code>. Open a folder in a
            terminal pane and it loads here.
          </div>
        </div>
      </div>
    );
  }

  const gitHere = gitStatus !== null && gitCwd === root;

  return (
    <div className="board-view" ref={viewRef} onKeyDown={onViewKeyDown}>
      {/* header strip */}
      <div className="board-head">
        <span className="board-title">Board</span>
        <span className="board-root" title={root}>{root}</span>
        <span className="board-head-spacer" />
        <span className="board-count tnum">{totalCards} card{totalCards === 1 ? "" : "s"}</span>
        <button
          type="button"
          className="board-btn"
          onClick={() => {
            setComposing(true);
            setError(null);
          }}
          disabled={composing}
        >
          <Icon name="ic-plus" size="sm" className="icon" />
          New card
        </button>
      </div>

      {error && (
        <div className="board-error" role="alert">
          <Icon name="ic-alert" size="sm" className="icon" />
          <span className="board-error-msg">{error}</span>
          <button type="button" className="board-error-x" aria-label="Dismiss" onClick={() => setError(null)}>
            <Icon name="ic-close" size="xs" className="icon" />
          </button>
        </div>
      )}

      {/* columns */}
      <div className="board-cols">
        {BOARD_COLUMNS.map((column) => {
          const live = columns.find((c) => c.id === column.id);
          const ids = live?.cardIds ?? [];
          return (
            <section className="board-col" key={column.id} aria-label={STATUS_WORD[column.id]}>
              <header className="board-col-head">
                <span className="board-col-name">{STATUS_WORD[column.id]}</span>
                <span className="board-col-count tnum">{ids.length}</span>
              </header>
              <div
                className={`board-col-body${dropTarget?.columnId === column.id ? " dropping" : ""}`}
                data-column-id={column.id}
                onDragOver={(e) => onColumnDragOver(e, column.id)}
                onDrop={(e) => onColumnDrop(e, column.id)}
              >
                {!loaded ? (
                  column.id !== "done" && (
                    <>
                      <div className="board-skel" />
                      <div className="board-skel short" />
                    </>
                  )
                ) : (
                  <>
                    {ids.map((id, i) => {
                      const card = cards[id];
                      if (!card) return null;
                      const indicator =
                        dropTarget?.columnId === column.id && dropTarget.index === i;
                      return (
                        <div key={id} className="board-cell">
                          {indicator && <div className="board-drop-line" />}
                          <BoardCard
                            card={card}
                            dragging={dragId === id}
                            onOpen={setOpenCardId}
                            onDragStart={onCardDragStart}
                            onDragEnd={clearDrag}
                          />
                        </div>
                      );
                    })}
                    {dropTarget?.columnId === column.id && dropTarget.index >= ids.length && (
                      <div className="board-drop-line" />
                    )}
                    {ids.length === 0 && (
                      <div className="board-col-empty">
                        {column.id === "todo" ? "No tasks yet. Add the first one below." : "No cards"}
                      </div>
                    )}
                    {column.id === "todo" &&
                      (composing ? (
                        <form
                          className="board-composer"
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitComposer();
                          }}
                        >
                          <input
                            autoFocus
                            className="board-input"
                            placeholder="Task title"
                            aria-label="Task title"
                            value={draftTitle}
                            spellCheck={false}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setComposing(false);
                              }
                            }}
                          />
                          <textarea
                            className="board-input board-textarea"
                            placeholder="Details (markdown, optional)"
                            aria-label="Task details"
                            rows={3}
                            value={draftBody}
                            spellCheck={false}
                            onChange={(e) => setDraftBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setComposing(false);
                              }
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                submitComposer();
                              }
                            }}
                          />
                          <div className="board-composer-row">
                            <m.button
                              type="submit"
                              className="board-btn primary"
                              disabled={!draftTitle.trim()}
                              whileTap={pressTap}
                            >
                              Add card
                            </m.button>
                            <button
                              type="button"
                              className="board-btn"
                              onClick={() => setComposing(false)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="board-add"
                          onClick={() => setComposing(true)}
                        >
                          <Icon name="ic-plus" size="sm" className="icon" />
                          New card
                        </button>
                      ))}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* seat picker popover (transient menu: §13.2 glass is sanctioned here) */}
      <AnimatePresence>
        {picker && (
          <m.div
            ref={pickerRef}
            className="board-picker glass"
            style={{ left: picker.x, top: picker.y }}
            role="dialog"
            aria-label="Dispatch to a seat"
            {...menuMotion}
          >
            <div className="board-picker-label">Dispatch to seat</div>
            <div className="board-picker-list" role="listbox" aria-label="Seats">
              {Object.entries(seats).map(([seat, model]) => {
                const hue = seatHueFor(seat, seats);
                const current = cards[picker.cardId]?.seat === seat;
                return (
                  <button
                    key={seat}
                    type="button"
                    className={`board-pick-seat${current ? " current" : ""}`}
                    role="option"
                    aria-selected={current}
                    data-seat={hue}
                    disabled={dispatching}
                    onClick={() => void dispatchWithSeat(picker.cardId, seat)}
                  >
                    <i className="seat-dot" aria-hidden="true" />
                    <span className="board-pick-word">{seat}</span>
                    <span className="board-pick-model">{model || "unpinned"}</span>
                    {current && <Icon name="ic-check" size="xs" className="icon" />}
                  </button>
                );
              })}
            </div>
            <div className="board-picker-hint">
              {dispatching ? "Dispatching…" : "Esc skips dispatch. The card stays In progress."}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* receipt drawer */}
      <AnimatePresence>
        {openCard && (
          <m.aside
            className="board-drawer elev-2"
            role="complementary"
            aria-label={`Card details: ${openCard.title}`}
            {...drawerMotion}
          >
            <div className="board-drawer-head">
              <span className="board-drawer-label">Task</span>
              <button
                type="button"
                className="board-iconbtn"
                aria-label="Close details"
                onClick={() => setOpenCardId(null)}
              >
                <Icon name="ic-close" size="sm" className="icon" />
              </button>
            </div>

            <div className="board-drawer-body">
              <div className="board-drawer-title">{openCard.title}</div>

              <div className="board-drawer-meta">
                <span className={`board-status-chip st-${openCard.status}`}>
                  {STATUS_WORD[openCard.status]}
                </span>
                {openCard.seat && (
                  <span className="seat-chip" data-seat={seatHueFor(openCard.seat, seats)}>
                    <i className="seat-dot" aria-hidden="true" />
                    {openCard.seat}
                  </span>
                )}
              </div>

              <div className="board-drawer-actions">
                <button
                  type="button"
                  className="board-btn"
                  disabled={!openCard.paneId}
                  title={openCard.paneId ? "Reveal the dispatched pane" : "No pane linked yet"}
                  onClick={() => {
                    if (!useBoard.getState().focusCard(openCard.id)) {
                      setError("That pane is gone. The session may have exited.");
                    }
                  }}
                >
                  <Icon name="ic-external" size="sm" className="icon" />
                  Open pane
                </button>
                <label className="board-move">
                  <span className="board-move-label">Move to</span>
                  <select
                    className="board-select"
                    value={openCard.status}
                    aria-label="Move card to column"
                    onChange={(e) =>
                      useBoard.getState().moveCard(openCard.id, e.target.value as CardStatus)
                    }
                  >
                    {BOARD_COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>{STATUS_WORD[c.id]}</option>
                    ))}
                  </select>
                </label>
              </div>

              {openCard.status === "review" && (
                <section className="board-review" aria-label="Review">
                  <div className="board-sec-label">Review</div>
                  {gitHere ? (
                    <>
                      <div className="board-diffstat">
                        {([
                          ["staged", gitStatus.staged.length],
                          ["unstaged", gitStatus.unstaged.length],
                          ["untracked", gitStatus.untracked.length],
                        ] as const)
                          .filter(([, n]) => n > 0)
                          .map(([label, n]) => (
                            <span key={label} className="board-diff-chip">
                              <span className="tnum">{n}</span> {label}
                            </span>
                          ))}
                        {gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length === 0 && (
                          <span className="board-diff-clean">
                            <Icon name="ic-check" size="xs" className="icon" />
                            Working tree clean
                          </span>
                        )}
                      </div>
                      <div className="board-diff-note">
                        Working tree of this project, not a per-agent diff.
                      </div>
                    </>
                  ) : (
                    <div className="board-diff-note">
                      Diff stat unavailable. Git is not tracking this project folder.
                    </div>
                  )}
                  <m.button
                    type="button"
                    className="board-btn primary"
                    whileTap={pressTap}
                    onClick={() => useBoard.getState().moveCard(openCard.id, "done")}
                  >
                    <Icon name="ic-check" size="sm" className="icon" />
                    Approve and move to Done
                  </m.button>
                </section>
              )}

              <section aria-label="Details">
                <div className="board-sec-label">Details</div>
                {openCard.body.trim() ? (
                  <div className="board-md">
                    <MdCard
                      widget={{
                        id: `board-${openCard.id}`,
                        paneId: openCard.paneId ?? "",
                        type: "md",
                        payload: { v: 1, t: "md", md: openCard.body },
                        ts: openCard.timeline[0]?.ts ?? 0,
                      }}
                    />
                  </div>
                ) : (
                  <div className="board-none">No details.</div>
                )}
              </section>

              <section aria-label="Receipts">
                <div className="board-sec-label">
                  Receipts <span className="tnum">{openCard.timeline.length}</span>
                </div>
                <ol className="board-timeline">
                  {[...openCard.timeline].reverse().map((ev: TimelineEvent, i: number) => {
                    const vis = eventVis(ev.kind);
                    return (
                      <li key={`${ev.ts}-${i}`} className={`bt-ev tone-${vis.tone}`}>
                        <span className="bt-ev-ic">
                          <Icon name={vis.icon} size="xs" className="icon" />
                        </span>
                        <span className="bt-ev-msg">{ev.msg}</span>
                        <span className="bt-ev-ts tnum">{fmtTs(ev.ts)}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          </m.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
