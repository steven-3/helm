/* ══════════════════════════════════════════════════════════════════════════
   useBoard — kanban board persisted at .helm/board.json (§3.1 schema, §4.4).

   Columns are fixed (todo/doing/review/done); cards carry a live timeline
   (§5.1 dispatch receipts) fed by dispatch + the bridge task.* verbs:
     task.progress → timeline append (card stays where it is)
     task.done     → doing → review (human approves review → done)
     task.blocked  → timeline append + status stays "doing" (attention store
                     surfaces the block; the board never yanks a card back)
   Persistence: debounced atomic write through helm_store_write. load(root)
   activates a project; verb subscription starts once at module scope.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { helmStoreRead, helmStoreWrite, onTaskVerb, type TaskVerb } from "../lib/ipc";
import { dispatchTask, revealPane, type DispatchReceipt } from "../lib/dispatch";

export type CardStatus = "todo" | "doing" | "review" | "done";

export interface TimelineEvent {
  ts: number;
  kind: string; // "created" | "dispatch" | "progress" | "blocked" | "done" | "moved" | "note"
  msg: string;
}

export interface Card {
  id: string;
  title: string;
  body: string;
  status: CardStatus;
  seat?: string;
  paneId?: string;
  sessionId?: string;
  timeline: TimelineEvent[];
  files?: string[];
}

export interface BoardColumn {
  id: CardStatus;
  name: string;
  cardIds: string[];
}

interface BoardFile {
  columns: BoardColumn[];
  cards: Record<string, Card>;
}

export const BOARD_COLUMNS: readonly { id: CardStatus; name: string }[] = [
  { id: "todo", name: "To do" },
  { id: "doing", name: "Doing" },
  { id: "review", name: "Review" },
  { id: "done", name: "Done" },
] as const;

const BOARD_REL_PATH = "board.json";
const SAVE_DEBOUNCE_MS = 400;
const MAX_TIMELINE_EVENTS = 200;

const uid = () => `card-${crypto.randomUUID().slice(0, 8)}`;

const emptyColumns = (): BoardColumn[] =>
  BOARD_COLUMNS.map((column) => ({ ...column, cardIds: [] }));

const isStatus = (value: unknown): value is CardStatus =>
  value === "todo" || value === "doing" || value === "review" || value === "done";

/** Rebuild a consistent board from possibly hand-edited/corrupt JSON: cards
    are authoritative for status; columns only order cards within a status. */
function sanitizeBoard(raw: unknown): BoardFile {
  const columns = emptyColumns();
  const cards: Record<string, Card> = {};
  if (!raw || typeof raw !== "object") return { columns, cards };
  const file = raw as Partial<BoardFile>;

  if (file.cards && typeof file.cards === "object" && !Array.isArray(file.cards)) {
    for (const [id, value] of Object.entries(file.cards)) {
      if (!value || typeof value !== "object") continue;
      const card = value as Partial<Card>;
      if (typeof card.title !== "string") continue;
      cards[id] = {
        id,
        title: card.title,
        body: typeof card.body === "string" ? card.body : "",
        status: isStatus(card.status) ? card.status : "todo",
        seat: typeof card.seat === "string" ? card.seat : undefined,
        paneId: typeof card.paneId === "string" ? card.paneId : undefined,
        sessionId: typeof card.sessionId === "string" ? card.sessionId : undefined,
        timeline: Array.isArray(card.timeline)
          ? card.timeline.filter(
              (event): event is TimelineEvent =>
                !!event && typeof event === "object" &&
                typeof (event as TimelineEvent).ts === "number" &&
                typeof (event as TimelineEvent).kind === "string" &&
                typeof (event as TimelineEvent).msg === "string",
            )
          : [],
        files: Array.isArray(card.files)
          ? card.files.filter((file): file is string => typeof file === "string")
          : undefined,
      };
    }
  }

  // Saved column order first (dropping ids of missing/moved cards)…
  const placed = new Set<string>();
  if (Array.isArray(file.columns)) {
    for (const rawColumn of file.columns) {
      if (!rawColumn || typeof rawColumn !== "object") continue;
      const column = columns.find((item) => item.id === (rawColumn as BoardColumn).id);
      const cardIds = (rawColumn as BoardColumn).cardIds;
      if (!column || !Array.isArray(cardIds)) continue;
      for (const cardId of cardIds) {
        const card = typeof cardId === "string" ? cards[cardId] : undefined;
        if (card && card.status === column.id && !placed.has(cardId)) {
          column.cardIds.push(cardId);
          placed.add(cardId);
        }
      }
    }
  }
  // …then any card the columns didn't reference lands at its status's tail.
  for (const card of Object.values(cards)) {
    if (!placed.has(card.id)) {
      columns.find((column) => column.id === card.status)!.cardIds.push(card.id);
    }
  }
  return { columns, cards };
}

interface BoardState {
  /** Project root the board belongs to; null until load(root). */
  root: string | null;
  columns: BoardColumn[];
  cards: Record<string, Card>;
  loaded: boolean;

  /** Activate a project: read .helm/board.json (missing file = empty board). */
  load: (root: string) => Promise<void>;
  addCard: (input: { title: string; body?: string; seat?: string; files?: string[] }) => string;
  /** Move within/between columns; `index` = drop position (append when absent). */
  moveCard: (id: string, status: CardStatus, index?: number) => void;
  /** §3.5 — pack + spawn via lib/dispatch; card → doing with pane links. */
  dispatchCard: (id: string) => Promise<DispatchReceipt | null>;
  timeline: (id: string) => TimelineEvent[];
  updateCard: (id: string, patch: Partial<Pick<Card, "title" | "body" | "seat" | "files">>) => void;
  removeCard: (id: string) => void;
  /** Jump to the card's dispatched pane (deep-link, §5.1). */
  focusCard: (id: string) => boolean;
  appendTimeline: (id: string, kind: string, msg: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer != null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { root, columns, cards, loaded } = useBoard.getState();
    if (!root || !loaded) return;
    const file: BoardFile = { columns, cards };
    void helmStoreWrite(root, BOARD_REL_PATH, JSON.stringify(file, null, 2)).catch(() => {
      // Persistence is best-effort; the live store remains authoritative and
      // the next mutation retries the write.
    });
  }, SAVE_DEBOUNCE_MS);
}

function withTimeline(card: Card, kind: string, msg: string, ts = Date.now()): Card {
  const timeline = [...card.timeline, { ts, kind, msg }];
  return {
    ...card,
    timeline: timeline.length > MAX_TIMELINE_EVENTS
      ? timeline.slice(timeline.length - MAX_TIMELINE_EVENTS)
      : timeline,
  };
}

function placeCard(columns: BoardColumn[], id: string, status: CardStatus, index?: number): BoardColumn[] {
  return columns.map((column) => {
    const cardIds = column.cardIds.filter((cardId) => cardId !== id);
    if (column.id !== status) {
      return cardIds.length === column.cardIds.length ? column : { ...column, cardIds };
    }
    const at = index === undefined ? cardIds.length : Math.max(0, Math.min(index, cardIds.length));
    cardIds.splice(at, 0, id);
    return { ...column, cardIds };
  });
}

export const useBoard = create<BoardState>((set, get) => ({
  root: null,
  columns: emptyColumns(),
  cards: {},
  loaded: false,

  load: async (root) => {
    set({ root, loaded: false });
    try {
      const raw = await helmStoreRead(root, BOARD_REL_PATH);
      const board = sanitizeBoard(JSON.parse(raw));
      // A slower load must not clobber a newer project's board.
      if (get().root !== root) return;
      set({ ...board, loaded: true });
    } catch {
      // Missing file / unreadable JSON → fresh empty board for this project.
      if (get().root !== root) return;
      set({ columns: emptyColumns(), cards: {}, loaded: true });
    }
  },

  addCard: (input) => {
    const id = uid();
    const card: Card = {
      id,
      title: input.title.trim() || "Untitled task",
      body: input.body?.trim() ?? "",
      status: "todo",
      seat: input.seat,
      files: input.files,
      timeline: [{ ts: Date.now(), kind: "created", msg: "Card created" }],
    };
    set((s) => ({
      cards: { ...s.cards, [id]: card },
      columns: placeCard(s.columns, id, "todo"),
    }));
    scheduleSave();
    return id;
  },

  moveCard: (id, status, index) => {
    set((s) => {
      const card = s.cards[id];
      if (!card) return s;
      const moved = card.status === status
        ? card
        : withTimeline({ ...card, status }, "moved", `Moved to ${status}`);
      return {
        cards: { ...s.cards, [id]: moved },
        columns: placeCard(s.columns, id, status, index),
      };
    });
    scheduleSave();
  },

  dispatchCard: async (id) => {
    const { root, cards } = get();
    const card = cards[id];
    if (!root || !card) return null;
    if (card.status === "doing") return null; // already running — never double-spawn

    let receipt: DispatchReceipt;
    try {
      receipt = await dispatchTask({
        id: card.id,
        title: card.title,
        body: card.body,
        files: card.files,
        seat: card.seat,
        projectRoot: root,
      });
    } catch (err) {
      set((s) => {
        const current = s.cards[id];
        if (!current) return s;
        return {
          cards: { ...s.cards, [id]: withTimeline(current, "note", `Dispatch failed: ${String(err)}`) },
        };
      });
      scheduleSave();
      return null;
    }

    set((s) => {
      const current = s.cards[id];
      if (!current) return s;
      const updated = withTimeline(
        {
          ...current,
          status: "doing",
          seat: receipt.seat,
          paneId: receipt.paneId,
          sessionId: receipt.sessionId,
        },
        "dispatch",
        `Dispatched to ${receipt.seat} (pane ${receipt.paneId})`,
      );
      return {
        cards: { ...s.cards, [id]: updated },
        columns: placeCard(s.columns, id, "doing"),
      };
    });
    scheduleSave();
    return receipt;
  },

  timeline: (id) => get().cards[id]?.timeline ?? [],

  updateCard: (id, patch) => {
    set((s) => {
      const card = s.cards[id];
      if (!card) return s;
      return { cards: { ...s.cards, [id]: { ...card, ...patch, id } } };
    });
    scheduleSave();
  },

  removeCard: (id) => {
    set((s) => {
      if (!s.cards[id]) return s;
      const cards = { ...s.cards };
      delete cards[id];
      return {
        cards,
        columns: s.columns.map((column) =>
          column.cardIds.includes(id)
            ? { ...column, cardIds: column.cardIds.filter((cardId) => cardId !== id) }
            : column,
        ),
      };
    });
    scheduleSave();
  },

  focusCard: (id) => {
    const paneId = get().cards[id]?.paneId;
    return paneId ? revealPane(paneId) : false;
  },

  appendTimeline: (id, kind, msg) => {
    set((s) => {
      const card = s.cards[id];
      if (!card) return s;
      return { cards: { ...s.cards, [id]: withTimeline(card, kind, msg) } };
    });
    scheduleSave();
  },
}));

/* ── bridge task.* verbs advance cards (§3.3 / §5.1) ─────────────────────────
   Verbs address cards by task id (= card id in dispatch packs). Unknown ids
   are ignored here — swarm missions own their own task namespace. */
function handleTaskVerb(verb: TaskVerb): void {
  const state = useBoard.getState();
  const card = state.cards[verb.taskId];
  if (!card) return;

  if (verb.kind === "task.progress") {
    state.appendTimeline(card.id, "progress", verb.msg ?? "Progress reported");
    return;
  }
  if (verb.kind === "task.blocked") {
    state.appendTimeline(card.id, "blocked", verb.msg ?? "Agent reports blocked");
    return;
  }
  // task.done → review (a human approves review → done; §4.4).
  state.appendTimeline(card.id, "done", verb.msg ?? "Agent reports done");
  if (card.status === "doing") state.moveCard(card.id, "review");
}

onTaskVerb(handleTaskVerb);
