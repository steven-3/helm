/* ══════════════════════════════════════════════════════════════════════════
   SearchView — project-wide search, the Sidebar "search" rail panel (replaces
   the P1 stub). Data + request lifecycle live in useProjectSearch (store); this
   view owns the 250ms debounce, the flatten/group rendering, and all keyboard
   navigation — the same split of responsibilities as TerminalSearch.

   Shape (VS Code idiom, retoned to DESIGN.md v3.1):
     · Composite query field (Editable role: the WRAPPER paints the focus ring
       via :focus-within, §10) with inline Aa / .* toggles + a filter button
       that expands a single include-glob field (mono — a path-like pattern).
     · Results grouped by file: a collapsible header row (type icon, name in
       the --text-name tier, dir + hit count receding) over hit rows at
       --row-h-compact. The match segment is sliced out via matchStart/matchEnd
       (UTF-16 units, safe for .slice()) and marked with the accent pair.
     · Keyboard: the input is the combobox — ArrowUp/Down move the selection
       through the flattened VISIBLE hits (collapsed groups are skipped), Enter
       opens, Escape clears the query (or returns focus to the terminal when
       the query is already empty). Mouse and keyboard share one selection.
     · Open = the FilesView mechanism verbatim: useStage.push({t:"file"}) on
       the focused pane's Stage. FilePreview has no line reveal, so a hit just
       opens the file (task scope).
   States: idle hint with the shortcut keycap · searching (inline spinner in
   the header count slot — no layout jump; prior results stay up) · zero
   results · error strip under the input (danger tokens) · a pinned truncation
   banner (warning chip) when the walk stops at the result cap.

   The search ROOT mirrors FilesView exactly: an explicit explorer root wins,
   otherwise the active pane's cwd. Mod+Shift+F (registered below at module
   scope, category "Search") opens the rail view and bumps focusNonce.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectSearch } from "../store/search";
import { usePanes } from "../store/panes";
import { useStage } from "../store/stage";
import { useExplorer } from "../store/explorer";
import { useEnv } from "../store/env";
import { useLayout } from "../store/layout";
import { focusPaneTerminal } from "../lib/terminal-session";
import { formatKeys, registerShortcut } from "../lib/shortcuts";
import { Icon } from "./icons";
import { FileTypeIcon } from "./file-icons";
import type { SearchHit } from "../lib/commands";
import "../styles/search.css";

const DEBOUNCE_MS = 250;
/* Leading context shown before the match (chars). The Rust backend windows
   lineText to ≤300 chars AROUND the match; on a 272px sidebar an ellipsis
   could still push the match out of view, so long lead-ins are trimmed with a
   "…" prefix and the match offsets are shifted to stay correct. */
const LEAD_CHARS = 48;

interface FlatHit {
  hit: SearchHit;
  /** Index into the flattened VISIBLE hits (expanded groups only). */
  flat: number;
}
interface HitGroup {
  path: string;
  /** Total hits in the file (independent of collapse). */
  total: number;
  hits: FlatHit[];
}

function splitPath(p: string): { dir: string; base: string } {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i < 0 ? { dir: "", base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

/** Join the search root with a root-relative hit path. The "/" separator is
    deliberate: the Rust fs backend accepts it on Windows too. */
function joinRoot(root: string, rel: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${rel}`;
}

/** Render pieces of a hit row: leading context trimmed, match offsets shifted. */
function matchSlices(hit: SearchHit): { before: string; match: string; after: string } {
  const start = hit.matchStart > LEAD_CHARS ? hit.matchStart - LEAD_CHARS : 0;
  const prefix = start > 0 ? "…" : "";
  const text = prefix + hit.lineText.slice(start);
  const ms = hit.matchStart - start + prefix.length;
  const me = hit.matchEnd - start + prefix.length;
  return { before: text.slice(0, ms), match: text.slice(ms, me), after: text.slice(me) };
}

export function SearchView() {
  const paneId = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.activePaneId ?? null;
  });
  const paneCwd = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return (tab && s.panes[tab.activePaneId]?.cwd) || null;
  });
  const override = useExplorer((s) => s.root);
  const home = useEnv((s) => s.home);
  // The live root — same resolution as FilesView: explicit location wins.
  const root = override ?? paneCwd;

  const query = useProjectSearch((s) => s.query);
  const caseSensitive = useProjectSearch((s) => s.caseSensitive);
  const regex = useProjectSearch((s) => s.regex);
  const includeGlob = useProjectSearch((s) => s.includeGlob);
  const filtersOpen = useProjectSearch((s) => s.filtersOpen);
  const status = useProjectSearch((s) => s.status);
  const results = useProjectSearch((s) => s.results);
  const truncated = useProjectSearch((s) => s.truncated);
  const error = useProjectSearch((s) => s.error);
  const collapsed = useProjectSearch((s) => s.collapsed);
  const focusNonce = useProjectSearch((s) => s.focusNonce);

  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [sel, setSel] = useState(-1);

  // Focus + select on mount and on every Mod+Shift+F re-press (nonce bump) —
  // mirrors the terminal find bar's refocus contract.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusNonce]);

  // The 250ms debounce. Toggles, the glob, and a root change re-arm the same
  // timer; an emptied query settles to idle immediately (no debounced lag).
  useEffect(() => {
    const store = useProjectSearch.getState();
    if (!root || !query.trim()) {
      store.reset();
      return;
    }
    const t = window.setTimeout(() => void store.run(root), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, caseSensitive, regex, includeGlob, root]);

  // Group by file (order of first appearance), then index the flattened
  // VISIBLE hits — collapsed groups drop out of keyboard navigation entirely.
  const groups = useMemo<HitGroup[]>(() => {
    const byPath = new Map<string, SearchHit[]>();
    for (const r of results) {
      const arr = byPath.get(r.path);
      if (arr) arr.push(r);
      else byPath.set(r.path, [r]);
    }
    let flat = 0;
    return [...byPath.entries()].map(([path, hits]) => ({
      path,
      total: hits.length,
      hits: collapsed.has(path) ? [] : hits.map((hit) => ({ hit, flat: flat++ })),
    }));
  }, [results, collapsed]);

  const flatList = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const flatCount = flatList.length;

  // Selection hygiene: a fresh result set selects the first hit; collapse
  // toggles just clamp the index into the still-visible range.
  useEffect(() => setSel(results.length ? 0 : -1), [results]);
  useEffect(() => {
    setSel((i) => (flatCount === 0 ? -1 : Math.min(i < 0 ? 0 : i, flatCount - 1)));
  }, [flatCount]);

  const openHit = (item: FlatHit) => {
    if (!paneId || !root) return; // same guard as FilesView.preview
    useStage.getState().push({
      paneId,
      payload: { v: 1, t: "file", path: joinRoot(root, item.hit.path) },
    });
  };

  const onQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) useProjectSearch.getState().setQuery("");
      else if (paneId) focusPaneTerminal(paneId);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (flatCount === 0) return;
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? sel < 0
            ? 0
            : (sel + 1) % flatCount
          : sel <= 0
            ? flatCount - 1
            : sel - 1;
      setSel(next);
      rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" && sel >= 0 && flatList[sel]) {
      e.preventDefault();
      openHit(flatList[sel]);
    }
  };

  const displayRoot = root && home && root.startsWith(home) ? `~${root.slice(home.length)}` : root;
  const searching = status === "searching";
  const showList = results.length > 0;

  return (
    <>
      <div className="side-head">
        <span className="side-title">Search</span>
        {searching ? (
          <span className="sv-spinner" aria-hidden="true" />
        ) : (
          results.length > 0 && <span className="side-count tnum">{results.length}</span>
        )}
      </div>

      <div className="sv-bar">
        <div className={`sv-field${error ? " invalid" : ""}`}>
          <Icon name="ic-search" size="sm" className="icon sv-glyph" />
          <input
            ref={inputRef}
            className="sv-input"
            value={query}
            placeholder="Search in files…"
            aria-label="Search in files"
            role="combobox"
            aria-expanded={showList}
            aria-controls="sv-results"
            aria-activedescendant={sel >= 0 ? `sv-hit-${sel}` : undefined}
            spellCheck={false}
            onChange={(e) => useProjectSearch.getState().setQuery(e.target.value)}
            onKeyDown={onQueryKeyDown}
          />
          <div className="sv-toggles">
            <button
              type="button"
              className={`sv-toggle${caseSensitive ? " on" : ""}`}
              aria-pressed={caseSensitive}
              aria-label="Match case"
              title="Match case"
              onClick={() => useProjectSearch.getState().setCaseSensitive(!caseSensitive)}
            >
              Aa
            </button>
            <button
              type="button"
              className={`sv-toggle${regex ? " on" : ""}`}
              aria-pressed={regex}
              aria-label="Use regular expression"
              title="Use regular expression"
              onClick={() => useProjectSearch.getState().setRegex(!regex)}
            >
              .*
            </button>
          </div>
        </div>
        <button
          type="button"
          className={`sv-filterbtn${filtersOpen ? " on" : ""}`}
          aria-pressed={filtersOpen}
          aria-expanded={filtersOpen}
          aria-controls="sv-globrow"
          aria-label="Filter files by glob"
          title="Filter files by glob"
          onClick={() => useProjectSearch.getState().toggleFilters()}
        >
          <Icon name="ic-settings" size="sm" className="icon" />
        </button>
      </div>

      {filtersOpen && (
        <div className="sv-globrow" id="sv-globrow">
          <input
            className="sv-glob"
            autoFocus
            value={includeGlob}
            placeholder="Include glob, e.g. *.ts or src/**"
            aria-label="Include glob"
            spellCheck={false}
            onChange={(e) => useProjectSearch.getState().setIncludeGlob(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
          />
        </div>
      )}

      {error && (
        <div className="sv-error" role="alert">
          <Icon name="ic-alert" size="xs" className="icon" />
          <span>{error}</span>
        </div>
      )}

      <div className="side-sep" />

      <div className="sv-body">
        {truncated && showList && (
          <div className="sv-trunc" role="status">
            <Icon name="ic-alert" size="xs" className="icon" />
            <span>
              Showing the first {results.length} matches. Refine the query or the include
              glob for a narrower set.
            </span>
          </div>
        )}

        {showList ? (
          <div className="sv-results" id="sv-results" role="listbox" aria-label="Search results">
            {groups.map((g) => {
              const { dir, base } = splitPath(g.path);
              const isCollapsed = collapsed.has(g.path);
              return (
                <div key={g.path} role="group" aria-label={g.path}>
                  <button
                    type="button"
                    className={`sv-file${isCollapsed ? " closed" : ""}`}
                    aria-expanded={!isCollapsed}
                    title={g.path}
                    onClick={() => useProjectSearch.getState().toggleCollapsed(g.path)}
                  >
                    <Icon name="ic-chev" size="xs" className="icon sv-chev" />
                    <FileTypeIcon name={base} />
                    <span className="sv-file-name">{base}</span>
                    {dir && <span className="sv-file-dir">{dir}</span>}
                    <span className="sv-file-count tnum">{g.total}</span>
                  </button>
                  {g.hits.map((item) => {
                    const { before, match, after } = matchSlices(item.hit);
                    const active = sel === item.flat;
                    return (
                      <div
                        key={`${item.hit.line}:${item.hit.column}`}
                        id={`sv-hit-${item.flat}`}
                        role="option"
                        aria-selected={active}
                        aria-label={`Line ${item.hit.line}: ${item.hit.lineText}`}
                        className={`sv-hit${active ? " selected" : ""}`}
                        ref={(el) => {
                          rowRefs.current[item.flat] = el;
                        }}
                        onMouseEnter={() => setSel(item.flat)}
                        onClick={() => openHit(item)}
                      >
                        <span className="sv-ln tnum">{item.hit.line}</span>
                        <span className="sv-text">
                          {before}
                          <mark className="sv-match">{match}</mark>
                          {after}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : searching ? (
          <div className="sv-note">searching {displayRoot ?? ""}…</div>
        ) : status === "done" && query.trim() ? (
          <div className="sv-empty">
            <Icon name="ic-search" className="icon" />
            <div className="sv-empty-title">No results for &lsquo;{query}&rsquo;</div>
            <div className="sv-empty-sub">
              {includeGlob.trim()
                ? `The include glob '${includeGlob.trim()}' may be filtering everything out.`
                : "Try a different spelling, or narrow it with an include glob."}
            </div>
          </div>
        ) : error ? (
          // The strip under the input carries the failure; no duplicate below.
          null
        ) : (
          <div className="sv-empty">
            <Icon name="ic-search" className="icon" />
            <div className="sv-empty-title">Find text across the project</div>
            <div className="sv-empty-sub">
              <kbd className="sv-kbd">{formatKeys("mod+shift+f")}</kbd> jumps here from
              anywhere. Arrow keys move, Enter opens the file.
            </div>
            {displayRoot ? (
              <div className="sv-root" title={root ?? undefined}>
                {displayRoot}
              </div>
            ) : (
              <div className="sv-empty-sub">
                No folder yet. Focus a terminal, or pick one in Files.
              </div>
            )}
          </div>
        )}
      </div>

      {/* accessible live status — announces result counts without visual noise
          (the .term-search-status pattern). */}
      <div className="sv-sr" role="status">
        {searching
          ? "Searching"
          : error
            ? `Search error: ${error}`
            : showList
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : query.trim()
                ? "No results"
                : ""}
      </div>
    </>
  );
}

/* Global shortcut: Mod+Shift+F opens the search rail view (category "Search")
   and requests input focus. Registered once at module scope — Sidebar imports
   this view statically, so registration rides the app module graph. When the
   sidebar plate is collapsed (sidebar === null) it is restored first; the
   shown panel then follows railView === "search" (Sidebar's own resolution). */
if (typeof window !== "undefined") {
  registerShortcut({
    id: "search.project",
    keys: "mod+shift+f",
    description: "Search in files",
    category: "Search",
    global: true,
    handler: () => {
      const layout = useLayout.getState();
      if (layout.sidebar === null) layout.setSidebar("roster");
      layout.setRailView("search");
      useProjectSearch.getState().requestFocus();
    },
  });
}
