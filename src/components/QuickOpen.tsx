/* ══════════════════════════════════════════════════════════════════════════
   QuickOpen — fuzzy file opener (workstream E, §4.11).

   Controlled overlay: the parent owns the shortcut (no global registration
   here) and renders `<QuickOpen open onClose />`. The walk root is the
   explorer's explicit root first, falling back to the active pane's cwd.
   Files are walked client-side through fs_read_dir with bounded concurrency,
   skipping the heavy dirs, capped at 10k; results fuzzy-match with the app's
   own fuzzy.ts and highlight the matched characters. Enter opens the file in
   the editor store; the walk is cached per root so re-opening is instant and
   refreshes in the background.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { fsReadDir } from "../lib/commands";
import { fuzzyMatch } from "../lib/fuzzy";
import { useEditor } from "../store/editor";
import { useExplorer } from "../store/explorer";
import { usePanes } from "../store/panes";
import { FileTypeIcon } from "./file-icons";
import { Icon } from "./icons";

const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist", "build", ".next"]);
const MAX_FILES = 10_000;
const MAX_RESULTS = 100;
const MAX_DEPTH = 16;
const WALK_CONCURRENCY = 16;

interface IndexedFile {
  /** Absolute path (fs_read_dir's own separator style). */
  path: string;
  name: string;
  /** Path relative to the walk root, "/" joined — the fuzzy target. */
  rel: string;
}

interface WalkResult {
  files: IndexedFile[];
  capped: boolean;
}

/* Per-root cache: a reopened palette renders instantly and the fresh walk
   swaps in underneath. Session-scoped; a stale entry costs one open. */
const walkCache = new Map<string, IndexedFile[]>();

async function walkFiles(root: string): Promise<WalkResult> {
  const files: IndexedFile[] = [];
  let capped = false;
  let pending = 0;
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: root, rel: "", depth: 0 }];

  const pump = () => {
    while (queue.length > 0 && pending < WALK_CONCURRENCY && !capped) {
      const item = queue.shift();
      if (!item || item.depth > MAX_DEPTH) continue;
      pending += 1;
      void fsReadDir(item.dir)
        .then((entries) => {
          for (const entry of entries) {
            if (entry.dir) {
              if (!SKIP_DIRS.has(entry.name) && !capped) {
                queue.push({
                  dir: entry.path,
                  rel: item.rel ? `${item.rel}/${entry.name}` : entry.name,
                  depth: item.depth + 1,
                });
              }
            } else if (files.length < MAX_FILES) {
              files.push({
                path: entry.path,
                name: entry.name,
                rel: item.rel ? `${item.rel}/${entry.name}` : entry.name,
              });
            } else {
              capped = true;
            }
          }
        })
        .catch(() => undefined) // unreadable dir → skipped, never fatal
        .finally(() => {
          pending -= 1;
          if (pending === 0 && (queue.length === 0 || capped)) finish();
          else pump();
        });
    }
    if (pending === 0 && (queue.length === 0 || capped)) finish();
  };
  pump();
  await done;
  return { files, capped };
}

/** Default root: the explorer's explicit root, else the active pane's cwd. */
function defaultRoot(): string {
  const explorerRoot = useExplorer.getState().root;
  if (explorerRoot) return explorerRoot;
  const { tabs, panes, activeTabId } = usePanes.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  const pane = tab ? panes[tab.activePaneId] : undefined;
  return pane?.cwd ?? "~";
}

interface Scored {
  file: IndexedFile;
  positions: number[];
}

/** Render `text` with the matched characters (indices into `rel`, offset by
    `base`) wrapped in accent marks; unmatched runs keep the row's tone. */
function Marked({ text, base, positions }: { text: string; base: number; positions: number[] }) {
  const marks = new Set(positions);
  const parts: React.ReactNode[] = [];
  let buffer = "";
  let marked = false;
  let key = 0;
  const flush = () => {
    if (!buffer) return;
    parts.push(marked
      ? <mark key={key++} className="qo-hl">{buffer}</mark>
      : <span key={key++}>{buffer}</span>);
    buffer = "";
  };
  for (let i = 0; i < text.length; i++) {
    const hit = marks.has(base + i);
    if (hit !== marked) flush();
    marked = hit;
    buffer += text[i];
  }
  flush();
  return <>{parts}</>;
}

export interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
  /** Overrides the explorer/pane-derived root. */
  root?: string;
}

export function QuickOpen({ open, onClose, root }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [capped, setCapped] = useState(false);
  const [active, setActive] = useState(0);
  const [walkRoot, setWalkRoot] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open lifecycle: resolve the root fresh each time, prime from cache, walk.
  useEffect(() => {
    if (!open) return;
    const resolved = root ?? defaultRoot();
    setWalkRoot(resolved);
    setQuery("");
    setActive(0);
    setCapped(false);
    setFiles(walkCache.get(resolved) ?? []);
    setIndexing(true);
    let alive = true;
    void walkFiles(resolved).then((result) => {
      if (!alive) return;
      walkCache.set(resolved, result.files);
      setFiles(result.files);
      setCapped(result.capped);
      setIndexing(false);
    });
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => { alive = false; };
  }, [open, root]);

  const results = useMemo<Scored[]>(() => {
    const q = query.trim();
    if (!q) return files.slice(0, MAX_RESULTS).map((file) => ({ file, positions: [] }));
    const scored: Array<Scored & { score: number }> = [];
    for (const file of files) {
      const match = fuzzyMatch(q, file.rel);
      if (match) scored.push({ file, positions: match.positions, score: match.score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map(({ file, positions }) => ({ file, positions }));
  }, [files, query]);

  useEffect(() => { setActive(0); }, [query]);
  const clamped = Math.min(active, Math.max(results.length - 1, 0));

  // Keep the keyboard-active row visible during ArrowUp/Down sweeps.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${clamped}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clamped, results.length]);

  if (!open) return null;

  const pick = (index: number) => {
    const item = results[index];
    if (!item) return;
    void useEditor.getState().openFile(item.file.path);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(clamped);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const showSkeleton = indexing && files.length === 0;

  return (
    <div className="qo-scrim" onClick={onClose}>
      <div
        className="qo-plate"
        role="dialog"
        aria-modal="true"
        aria-label="Quick open"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qo-input-row">
          <Icon name="ic-search" size="sm" />
          <input
            ref={inputRef}
            className="qo-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Search files in ${walkRoot}`}
            role="combobox"
            aria-expanded="true"
            aria-controls="qo-list"
            aria-activedescendant={results.length > 0 ? `qo-opt-${clamped}` : undefined}
            aria-label="Search files"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="qo-list" id="qo-list" role="listbox" ref={listRef} aria-label="Files">
          {showSkeleton ? (
            Array.from({ length: 6 }, (_, i) => (
              <div className="qo-skel" key={i} aria-hidden="true"><b /><i /></div>
            ))
          ) : results.length === 0 ? (
            <div className="qo-note">
              {files.length === 0
                ? `No files found under ${walkRoot}`
                : `No matches for "${query.trim()}"`}
            </div>
          ) : (
            results.map(({ file, positions }, index) => {
              const dirLength = file.rel.length - file.name.length; // includes the "/" when in a subdir
              const dir = dirLength > 1 ? file.rel.slice(0, dirLength - 1) : "";
              return (
                <div
                  key={file.rel}
                  id={`qo-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === clamped}
                  className={`qo-row${index === clamped ? " active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(index)}
                >
                  <span className="qo-ico"><FileTypeIcon name={file.name} className="qo-fic" /></span>
                  <span className="qo-name">
                    <Marked text={file.name} base={dirLength} positions={positions} />
                  </span>
                  {dir && (
                    <span className="qo-dir">
                      <Marked text={dir} base={0} positions={positions} />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="qo-foot">
          <span className="qo-count">
            {indexing && files.length === 0
              ? "Indexing…"
              : `${files.length.toLocaleString()} files${capped ? " · capped" : ""}`}
          </span>
          <span className="qo-spacer" />
          <span className="qo-hints">
            <kbd className="qo-kbd">↑↓</kbd> navigate
            <kbd className="qo-kbd">↵</kbd> open
            <kbd className="qo-kbd">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
