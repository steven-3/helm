/* ══════════════════════════════════════════════════════════════════════════
   DiffView (WS-8) — a dismissible, full-window per-file diff overlay OWNED by the
   SCM view (it is rendered from ScmView, NOT wired into App.tsx). It mirrors the
   Settings-modal mechanism already proven in this app: a fixed scrim + a centered
   floating plate, Esc + scrim-mousedown + a close button to dismiss, with focus
   moved in on mount and restored on unmount. Motion is the house scrim/modal
   preset (reduced-motion degrades to opacity via the global <MotionConfig>).

   The heart is the parser: it takes the RAW unified-diff text returned by
   useGit.diff(path, staged) and turns it into typed lines the well renders as
   red/green hunks. It handles: multi-hunk @@ headers (with per-side line numbers),
   binary files, pure renames (similarity 100%, no hunks), new/deleted files
   (/dev/null sides), "\ No newline at end of file", and an empty diff (e.g. an
   untracked file the backend can't textually diff) — each as an honest note, never
   a blank panel.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { Icon } from "./icons";
import { scrimMotion, modalMotion } from "../lib/motion";
import "../styles/scm.css";

type LineKind = "add" | "del" | "ctx" | "hunk" | "meta";

interface DiffLine {
  kind: LineKind;
  text: string;
  /** old-side line number (del/ctx); undefined on add + hunk rails. */
  oldNo?: number;
  /** new-side line number (add/ctx); undefined on del + hunk rails. */
  newNo?: number;
}

interface ParsedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
  binary: boolean;
  /** set when git reported a rename/copy for this path. */
  rename?: { from: string; to: string };
  /** true when there is nothing textual to show (identical, or untracked/no diff). */
  empty: boolean;
  /** guard against a pathologically large single-file diff. */
  truncated: boolean;
  /** true when the raw diff is too large to parse or render safely. */
  tooLarge: boolean;
  /** true when git emitted a combined diff for an unmerged path. */
  combined: boolean;
}

const MAX_LINES = 6000; // a single file's diff past this is almost certainly generated/minified
const MAX_DIFF_CHARS = 1_500_000;
const MAX_LINE_CHARS = 5000;
const LINE_TRUNCATED_SUFFIX = "… (line truncated)";

const COMBINED_DIFF_RE = /^(?:diff --cc |diff --combined |@@@(?:\s|$))/m;
const HUNK_RE = /^(@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@)(.*)$/;

function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  return `${line.slice(0, MAX_LINE_CHARS - LINE_TRUNCATED_SUFFIX.length)}${LINE_TRUNCATED_SUFFIX}`;
}

function parseDiff(raw: string): ParsedDiff {
  if (raw.length > MAX_DIFF_CHARS) {
    return {
      lines: [],
      added: 0,
      removed: 0,
      binary: false,
      empty: false,
      truncated: false,
      tooLarge: true,
      combined: false,
    };
  }

  if (COMBINED_DIFF_RE.test(raw)) {
    return {
      lines: [],
      added: 0,
      removed: 0,
      binary: false,
      empty: false,
      truncated: false,
      tooLarge: false,
      combined: true,
    };
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let binary = false;
  let renameFrom: string | undefined;
  let renameTo: string | undefined;
  let oldNo = 0;
  let newNo = 0;
  let sawHunk = false;

  const src = raw.split("\n");
  // git appends a trailing newline → drop the final empty element so it is not
  // mis-rendered as a blank context line.
  if (src.length && src[src.length - 1] === "") src.pop();

  for (const sourceLine of src) {
    const line = truncateLine(sourceLine);

    // ── file-level headers: captured for metadata, never rendered as code ──
    if (line.startsWith("diff --git")) continue;
    if (
      line.startsWith("index ") ||
      line.startsWith("old mode ") ||
      line.startsWith("new mode ") ||
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ") ||
      line.startsWith("similarity index ") ||
      line.startsWith("dissimilarity index ")
    ) {
      continue;
    }
    if (line.startsWith("rename from ") || line.startsWith("copy from ")) {
      renameFrom = line.slice(line.indexOf("from ") + 5);
      continue;
    }
    if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
      renameTo = line.slice(line.indexOf("to ") + 3);
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue; // file markers
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      binary = true;
      continue;
    }

    // ── hunk header ──
    if (line.startsWith("@@")) {
      sawHunk = true;
      const match = HUNK_RE.exec(line);
      oldNo = match ? parseInt(match[2], 10) : 0;
      newNo = match ? parseInt(match[3], 10) : 0;
      const pos = match ? match[1] : line;
      const section = match ? match[4].trim() : "";
      // Render the hunk position + section context as a dimmed rail.
      lines.push({ kind: "hunk", text: section ? `${pos} ${section}` : pos });
      continue;
    }

    if (!sawHunk) continue; // pre-hunk preamble already consumed above

    const marker = line[0];
    const body = line.slice(1);
    if (marker === "+") {
      lines.push({ kind: "add", text: body, newNo });
      newNo += 1;
      added += 1;
    } else if (marker === "-") {
      lines.push({ kind: "del", text: body, oldNo });
      oldNo += 1;
      removed += 1;
    } else if (marker === "\\") {
      // "\ No newline at end of file"
      lines.push({ kind: "meta", text: line.slice(2) });
    } else {
      // context (leading space) or a genuinely blank line inside a hunk
      lines.push({ kind: "ctx", text: body, oldNo, newNo });
      oldNo += 1;
      newNo += 1;
    }

    if (lines.length >= MAX_LINES) {
      return {
        lines,
        added,
        removed,
        binary,
        rename: renameFrom && renameTo ? { from: renameFrom, to: renameTo } : undefined,
        empty: false,
        truncated: true,
        tooLarge: false,
        combined: false,
      };
    }
  }

  const rename = renameFrom && renameTo ? { from: renameFrom, to: renameTo } : undefined;
  const empty = lines.filter((l) => l.kind !== "meta").length === 0 && !binary;
  return {
    lines,
    added,
    removed,
    binary,
    rename,
    empty,
    truncated: false,
    tooLarge: false,
    combined: false,
  };
}

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

export function DiffView({
  path,
  staged,
  loadDiff,
  onClose,
}: {
  path: string;
  staged: boolean;
  loadDiff: (path: string, staged: boolean) => Promise<string>;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [raw, setRaw] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const { dir, base } = useMemo(() => splitPath(path), [path]);
  const parsed = useMemo(() => (state === "ready" ? parseDiff(raw) : null), [state, raw]);

  // Load the diff for this specific file/side.
  useEffect(() => {
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const text = await loadDiff(path, staged);
        if (!alive) return;
        setRaw(text);
        setState("ready");
      } catch (e) {
        if (!alive) return;
        setErrMsg(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, staged, loadDiff]);

  // Focus in on mount, restore on unmount, Esc to close, minimal Tab trap.
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
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((c) => c.offsetParent !== null);
      if (controls.length === 0) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <m.div className="diff-scrim" onMouseDown={onClose} {...scrimMotion}>
      <m.div
        className="diff-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Diff of ${path}`}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
        {...modalMotion}
      >
        <header className="diff-head">
          <div className="diff-title">
            <span className={`diff-chip${staged ? " staged" : ""}`}>
              {staged ? "Staged" : "Working tree"}
            </span>
            <span className="diff-path" title={path}>
              <span className="diff-path-dir">{dir}</span>
              <span className="diff-path-base">{base}</span>
            </span>
          </div>
          <div className="diff-head-right">
            {parsed &&
              !parsed.binary &&
              !parsed.empty &&
              !parsed.tooLarge &&
              !parsed.combined && (
              <span className="diff-stat" aria-label={`${parsed.added} added, ${parsed.removed} removed`}>
                <span className="add">+{parsed.added}</span>
                <span className="del">&minus;{parsed.removed}</span>
              </span>
            )}
            <button type="button" className="diff-close" aria-label="Close diff (Esc)" onClick={onClose}>
              <Icon name="ic-close" size="sm" />
            </button>
          </div>
        </header>

        <div className="diff-body">
          {state === "loading" ? (
            <div className="diff-note">Reading diff…</div>
          ) : state === "error" ? (
            <div className="diff-note err" role="alert">
              <Icon name="ic-alert" />
              <div>Could not load the diff.</div>
              <div className="diff-note-detail">{errMsg}</div>
            </div>
          ) : parsed!.tooLarge ? (
            <div className="diff-note">
              <Icon name="ic-alert" />
              Diff too large to display.
            </div>
          ) : parsed!.combined ? (
            <div className="diff-note">
              <Icon name="ic-alert" />
              Merge conflict — resolve it in the terminal or editor.
            </div>
          ) : parsed!.binary ? (
            <div className="diff-note">
              <Icon name="ic-image" />
              Binary file — no textual diff to display.
            </div>
          ) : parsed!.empty ? (
            <div className="diff-note">
              <Icon name="ic-check" />
              {parsed!.rename
                ? "Renamed with no content changes."
                : "No textual changes to display."}
            </div>
          ) : (
            <>
              {parsed!.rename && (
                <div className="diff-rename">
                  <Icon name="ic-branch" size="xs" />
                  Renamed <b>{parsed!.rename.from}</b> &rarr; <b>{parsed!.rename.to}</b>
                </div>
              )}
              <div className="diff-well" role="figure" aria-label="Unified diff" tabIndex={0}>
                <div className="diff-lines">
                  {parsed!.lines.map((ln, i) => (
                    <div className={`diff-line diff-${ln.kind}`} key={i}>
                      <span className="diff-rail">
                        <span className="diff-no">{ln.kind === "hunk" ? "" : ln.oldNo ?? ""}</span>
                        <span className="diff-no">{ln.kind === "hunk" ? "" : ln.newNo ?? ""}</span>
                        <span className="diff-sign">
                          {ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : ""}
                        </span>
                      </span>
                      <code className="diff-code">{ln.text || " "}</code>
                    </div>
                  ))}
                </div>
              </div>
              {parsed!.truncated && (
                <div className="diff-rename diff-truncated" role="status">
                  <Icon name="ic-alert" size="xs" />
                  Large diff — showing the first {MAX_LINES.toLocaleString()} lines.
                </div>
              )}
            </>
          )}
        </div>
      </m.div>
    </m.div>
  );
}
