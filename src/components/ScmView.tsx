/* ══════════════════════════════════════════════════════════════════════════
   ScmView (WS-8) — the VS Code-shaped Source Control panel, extracted from
   Sidebar. Binds to the LOCKED useGit store API (staged / unstaged / untracked +
   the stage/unstage/commit/diff/branch/push/pull/fetch/discard actions); it does
   NOT touch the store or any Rust.

   Shape (VS Code parity, retoned to DESIGN.md v3):
     · Branch bar   — current ref (mono) + ahead/behind (clickable pull ↓ / push ↑)
                      + a sync affordance + a branch switcher popover (§10 floating).
     · Commit well  — a raised message box + the ONE rare indigo primary button;
                      disabled until something is staged and a message is typed.
     · Groups       — STAGED CHANGES / CHANGES, each collapsible with a count and a
                      hover-revealed stage-all / unstage-all. Empty groups hide.
     · File rows    — transparent-on-plate, hover-lift; a type-letter badge coloured
                      by status token; path in mono (dir dimmed); hover-revealed
                      stage +, unstage −, and a guarded discard.
     · DiffView     — clicking a row opens the per-file red/green diff as a
                      dismissible full-window overlay OWNED here (never wired into
                      App.tsx).
   Failures (commit rejected, push denied, …) surface in a real danger strip — the
   store methods throw, they never fake success.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { useGit } from "../store/git";
import type { GitBranchList, GitEntry } from "../lib/contract";
import { Icon } from "./icons";
import { menuMotion, pressTap } from "../lib/motion";
import { DiffView } from "./DiffView";
import "../styles/scm.css";

type Tone = "success" | "danger" | "warning" | "info" | "muted";
type RowKind = "staged" | "unstaged" | "untracked";

/** porcelain status char → the badge letter + which status token colours it.
    Restricted to success / danger / warning per the WS-8 spec; untracked → U. */
function typeVis(ch: string, untracked: boolean): { letter: string; tone: Tone } {
  if (untracked) return { letter: "U", tone: "success" };
  switch (ch) {
    case "M": return { letter: "M", tone: "warning" };
    case "A": return { letter: "A", tone: "success" };
    case "D": return { letter: "D", tone: "danger" };
    case "R": return { letter: "R", tone: "warning" };
    case "C": return { letter: "C", tone: "success" };
    case "T": return { letter: "T", tone: "warning" };
    case "U": return { letter: "U", tone: "danger" };   // unmerged conflict
    case "?": return { letter: "U", tone: "success" };
    default: return { letter: ch?.trim() || "•", tone: "muted" };
  }
}

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

/* Two glyphs the shared sprite lacks (icons.tsx is out of scope). Inline SVGs so
   they still inherit the .icon stroke/size contract (currentColor, no fill). */
function SyncGlyph({ className = "icon sm", spin = false }: { className?: string; spin?: boolean }) {
  return (
    <svg className={`${className}${spin ? " scm-spin" : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 7A8 8 0 0 0 5.6 8.6" />
      <path d="M20.5 3.2v4.2h-4.2" />
      <path d="M4 17A8 8 0 0 0 18.4 15.4" />
      <path d="M3.5 20.8v-4.2h4.2" />
    </svg>
  );
}
function RevertGlyph({ className = "icon sm" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.6 8.6A8 8 0 1 1 3.3 13.2" />
      <path d="M9.2 8.6H4.6V4" />
    </svg>
  );
}

export function ScmView() {
  const status = useGit((s) => s.status);
  const stage = useGit((s) => s.stage);
  const unstage = useGit((s) => s.unstage);
  const stageAll = useGit((s) => s.stageAll);
  const unstageAll = useGit((s) => s.unstageAll);
  const commit = useGit((s) => s.commit);
  const diff = useGit((s) => s.diff);
  const listBranches = useGit((s) => s.listBranches);
  const checkout = useGit((s) => s.checkout);
  const createBranch = useGit((s) => s.createBranch);
  const discard = useGit((s) => s.discard);
  const push = useGit((s) => s.push);
  const pull = useGit((s) => s.pull);
  const fetch = useGit((s) => s.fetch);
  const refresh = useGit((s) => s.refresh);

  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [collapsed, setCollapsed] = useState({ staged: false, changes: false });
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<{ path: string; staged: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const [menuOpen, setMenuOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchList | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const branchbarRef = useRef<HTMLDivElement>(null);

  const isBusy = (k: string) => busy.has(k);
  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(key));
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : "Git operation failed");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  }, []);

  // dismiss the branch popover on outside-click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (branchbarRef.current && !branchbarRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (status === null) {
    return (
      <>
        <div className="side-head">
          <span className="side-title">Source control</span>
        </div>
        <div className="side-sep" />
        <div className="scm-empty plain">
          <Icon name="ic-branch" className="icon" />
          <div className="scm-empty-title">Not a git repository</div>
          <div className="scm-empty-sub">Open a folder tracked by git to see changes.</div>
        </div>
      </>
    );
  }

  const staged = status.staged;
  const unstaged = status.unstaged;
  const untracked = status.untracked;
  const total = status.changes.length;
  const nothing = staged.length + unstaged.length + untracked.length === 0;
  const canCommit = message.trim().length > 0 && (staged.length > 0 || amend);

  const openBranchMenu = () => {
    setMenuOpen(true);
    setCreating(false);
    setNewName("");
    setBranches(null);
    void (async () => {
      try {
        setBranches(await listBranches());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not list branches");
        setMenuOpen(false);
      }
    })();
  };
  const doCheckout = (b: string) => {
    setMenuOpen(false);
    void run("checkout", () => checkout(b));
  };
  const doCreate = () => {
    const name = newName.trim();
    if (!name) return;
    setMenuOpen(false);
    void run("create", () => createBranch(name));
  };
  const doCommit = () => {
    if (!canCommit) return;
    void run("commit", async () => {
      await commit(message.trim(), amend);
      setMessage("");
      setAmend(false);
    });
  };
  const onSync = () => {
    const behind = status.behind ?? 0;
    const ahead = status.ahead ?? 0;
    if (behind > 0) void run("sync", pull);
    else if (ahead > 0) void run("sync", push);
    else void run("sync", fetch);
  };
  const doDiscard = (path: string) => {
    setConfirmDiscard(null);
    void run(`discard:${path}`, () => discard(path));
  };

  const renderRow = (entry: GitEntry, kind: RowKind) => {
    const isStaged = kind === "staged";
    const untr = kind === "untracked";
    const tv = typeVis(isStaged ? entry.x : entry.y, untr);
    const { dir, base } = splitPath(entry.path);
    const armed = confirmDiscard === entry.path && !isStaged;
    const active = diffTarget?.path === entry.path && diffTarget.staged === isStaged;
    return (
      <div
        className={`scm-file${isStaged ? " staged" : ""}${active ? " active" : ""}`}
        role="listitem"
        key={`${kind}:${entry.path}`}
      >
        <button
          type="button"
          className="scm-file-open"
          title={entry.path}
          aria-label={`Open diff for ${entry.path}`}
          onClick={() => setDiffTarget({ path: entry.path, staged: isStaged })}
        >
          <span className={`scm-type tone-${tv.tone}`} aria-hidden="true">{tv.letter}</span>
          <span className="scm-file-label">
            <span className="scm-file-name">{base}</span>
            {entry.renamedFrom && (
              <span className="scm-file-rename" title={`renamed from ${entry.renamedFrom}`}>
                &larr; {splitPath(entry.renamedFrom).base}
              </span>
            )}
            {dir && <span className="scm-file-dir">{dir}</span>}
          </span>
        </button>

        {armed ? (
          <div className="scm-confirm" role="group" aria-label="Confirm discard">
            <span className="scm-confirm-msg">{untr ? "Delete file?" : "Discard changes?"}</span>
            <button type="button" className="scm-confirm-btn scm-confirm-yes" onClick={() => doDiscard(entry.path)}>
              {untr ? "Delete" : "Discard"}
            </button>
            <button type="button" className="scm-confirm-btn scm-confirm-no" onClick={() => setConfirmDiscard(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="scm-file-actions">
            {!isStaged && (
              <button
                type="button"
                className="scm-iconbtn danger"
                title={untr ? "Delete untracked file" : "Discard changes"}
                aria-label={`${untr ? "Delete" : "Discard changes to"} ${base}`}
                onClick={() => setConfirmDiscard(entry.path)}
              >
                <RevertGlyph className="icon sm" />
              </button>
            )}
            {isStaged ? (
              <button
                type="button"
                className="scm-iconbtn"
                title="Unstage changes"
                aria-label={`Unstage ${base}`}
                onClick={() => void run(`unstage:${entry.path}`, () => unstage(entry.path))}
              >
                <Icon name="ic-min" size="sm" className="icon" />
              </button>
            ) : (
              <button
                type="button"
                className="scm-iconbtn stage"
                title="Stage changes"
                aria-label={`Stage ${base}`}
                onClick={() => void run(`stage:${entry.path}`, () => stage(entry.path))}
              >
                <Icon name="ic-plus" size="sm" className="icon" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="scm">
      <div className="side-head">
        <span className="side-title">Source control</span>
        <div className="scm-head-actions">
          <span className="side-count tnum">{total}</span>
          <button
            type="button"
            className="scm-iconbtn"
            title="Refresh"
            aria-label="Refresh source control"
            onClick={() => void run("refresh", refresh)}
            disabled={isBusy("refresh")}
          >
            <SyncGlyph className="icon sm" spin={isBusy("refresh")} />
          </button>
        </div>
      </div>

      {/* branch bar */}
      <div className="scm-branchbar" ref={branchbarRef}>
        <button
          type="button"
          className="scm-branch"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          title="Switch branch"
          onClick={() => (menuOpen ? setMenuOpen(false) : openBranchMenu())}
        >
          <Icon name="ic-branch" size="sm" className="icon scm-branch-glyph" />
          <span className="scm-branch-name">{status.branch ?? "detached HEAD"}</span>
          <Icon name="ic-caret" size="xs" className="icon scm-branch-caret" />
        </button>

        {status.behind != null && status.behind > 0 && (
          <button
            type="button"
            className="scm-trackbtn"
            title={`Pull ${status.behind} commit(s) from ${status.upstream ?? "upstream"}`}
            aria-label={`Pull ${status.behind} commits`}
            onClick={() => void run("pull", pull)}
            disabled={isBusy("pull") || isBusy("sync")}
          >
            <Icon name="ic-caret" size="xs" className="icon" />
            {status.behind}
          </button>
        )}
        {status.ahead != null && status.ahead > 0 && (
          <button
            type="button"
            className="scm-trackbtn"
            title={`Push ${status.ahead} commit(s) to ${status.upstream ?? "upstream"}`}
            aria-label={`Push ${status.ahead} commits`}
            onClick={() => void run("push", push)}
            disabled={isBusy("push") || isBusy("sync")}
          >
            <Icon name="ic-caret" size="xs" className="icon scm-up-icon" />
            {status.ahead}
          </button>
        )}
        <button
          type="button"
          className="scm-sync"
          title="Sync with remote (fetch / pull / push)"
          aria-label="Sync with remote"
          onClick={onSync}
          disabled={isBusy("sync")}
        >
          <SyncGlyph className="icon sm" spin={isBusy("sync")} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <m.div className="scm-menu" role="listbox" aria-label="Branches" {...menuMotion}>
              <div className="scm-menu-label">Switch branch</div>
              <div className="scm-menu-list">
                {branches === null ? (
                  <div className="scm-menu-item" aria-disabled>Loading…</div>
                ) : branches.branches.length === 0 ? (
                  <div className="scm-menu-item" aria-disabled>No branches</div>
                ) : (
                  branches.branches.map((b) => {
                    const cur = b === branches.current;
                    return (
                      <button
                        type="button"
                        key={b}
                        className={`scm-menu-item${cur ? " current" : ""}`}
                        role="option"
                        aria-selected={cur}
                        onClick={() => !cur && doCheckout(b)}
                      >
                        {cur ? (
                          <Icon name="ic-check" size="xs" className="icon scm-menu-check" />
                        ) : (
                          <span className="scm-menu-check" />
                        )}
                        <span className="scm-menu-name">{b}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="scm-menu-foot">
                {creating ? (
                  <form className="scm-menu-form" onSubmit={(e) => { e.preventDefault(); doCreate(); }}>
                    <input
                      autoFocus
                      className="scm-menu-input"
                      placeholder="new-branch-name"
                      aria-label="New branch name"
                      value={newName}
                      spellCheck={false}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <button type="submit" className="scm-iconbtn stage" title="Create branch" aria-label="Create branch">
                      <Icon name="ic-check" size="sm" className="icon" />
                    </button>
                  </form>
                ) : (
                  <button type="button" className="scm-menu-create" onClick={() => setCreating(true)}>
                    <Icon name="ic-plus" size="sm" className="icon" />
                    Create new branch…
                  </button>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* commit well */}
      <div className="scm-commit">
        <textarea
          className="scm-commit-input"
          value={message}
          placeholder="Message (Ctrl+Enter to commit)"
          aria-label="Commit message"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              doCommit();
            }
          }}
        />
        <div className="scm-commit-row">
          <button
            type="button"
            className="scm-amend"
            aria-pressed={amend}
            title="Amend the previous commit"
            onClick={() => setAmend((a) => !a)}
          >
            <span className="scm-check">{amend && <Icon name="ic-check" size="xs" className="icon" />}</span>
            Amend
          </button>
          <m.button
            type="button"
            className="scm-commit-btn"
            disabled={!canCommit || isBusy("commit")}
            whileTap={pressTap}
            onClick={doCommit}
          >
            <Icon name="ic-check" size="sm" className="icon" />
            {amend ? "Commit (amend)" : "Commit"}
            {staged.length > 0 && <span className="scm-commit-count">{staged.length}</span>}
          </m.button>
        </div>
      </div>

      {error && (
        <div className="scm-error" role="alert">
          <Icon name="ic-alert" size="sm" className="icon" />
          <span className="scm-error-msg">{error}</span>
          <button type="button" className="scm-error-x" aria-label="Dismiss error" onClick={() => setError(null)}>
            <Icon name="ic-close" size="xs" className="icon" />
          </button>
        </div>
      )}

      {/* change groups */}
      <div className="scm-body">
        {nothing ? (
          <div className="scm-empty">
            <Icon name="ic-check" className="icon" />
            <div className="scm-empty-title">No changes</div>
            <div className="scm-empty-sub">Your working tree is clean.</div>
          </div>
        ) : (
          <>
            {staged.length > 0 && (
              <div className={`scm-group${collapsed.staged ? "" : " open"}`}>
                <div className="scm-group-head">
                  <button
                    type="button"
                    className="scm-group-twist"
                    aria-expanded={!collapsed.staged}
                    onClick={() => setCollapsed((c) => ({ ...c, staged: !c.staged }))}
                  >
                    <Icon name="ic-chev" size="xs" className="icon scm-group-caret" />
                    <span className="scm-group-title">Staged changes</span>
                    <span className="scm-group-count tnum">{staged.length}</span>
                  </button>
                  <div className="scm-group-actions">
                    <button
                      type="button"
                      className="scm-iconbtn"
                      title="Unstage all"
                      aria-label="Unstage all changes"
                      onClick={() => void run("unstageAll", unstageAll)}
                    >
                      <Icon name="ic-min" size="sm" className="icon" />
                    </button>
                  </div>
                </div>
                {!collapsed.staged && <div role="list">{staged.map((e) => renderRow(e, "staged"))}</div>}
              </div>
            )}

            {unstaged.length + untracked.length > 0 && (
              <div className={`scm-group${collapsed.changes ? "" : " open"}`}>
                <div className="scm-group-head">
                  <button
                    type="button"
                    className="scm-group-twist"
                    aria-expanded={!collapsed.changes}
                    onClick={() => setCollapsed((c) => ({ ...c, changes: !c.changes }))}
                  >
                    <Icon name="ic-chev" size="xs" className="icon scm-group-caret" />
                    <span className="scm-group-title">Changes</span>
                    <span className="scm-group-count tnum">{unstaged.length + untracked.length}</span>
                  </button>
                  <div className="scm-group-actions">
                    <button
                      type="button"
                      className="scm-iconbtn stage"
                      title="Stage all"
                      aria-label="Stage all changes"
                      onClick={() => void run("stageAll", stageAll)}
                    >
                      <Icon name="ic-plus" size="sm" className="icon" />
                    </button>
                  </div>
                </div>
                {!collapsed.changes && (
                  <div role="list">
                    {unstaged.map((e) => renderRow(e, "unstaged"))}
                    {untracked.map((e) => renderRow(e, "untracked"))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* per-file diff overlay — owned here, NOT wired into App.tsx */}
      <AnimatePresence>
        {diffTarget && (
          <DiffView
            key={`${diffTarget.staged ? "s" : "w"}:${diffTarget.path}`}
            path={diffTarget.path}
            staged={diffTarget.staged}
            loadDiff={diff}
            onClose={() => setDiffTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
