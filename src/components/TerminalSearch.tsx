/* ══════════════════════════════════════════════════════════════════════════
   TerminalSearch (Tier C) — a compact find bar pinned top-right INSIDE a focused
   terminal pane's void well. Ctrl+F / Cmd+F opens it (intercepted in
   terminal-session.ts's custom key handler, which swallows ^F so it never
   reaches the PTY and hands keystrokes to this <input> instead).

   Live, debounced search over the pane's SearchAddon via paneSearch(); Enter =
   next match, Shift+Enter = previous; Aa = case-sensitive, .* = regex. No results
   → a subtle danger tint on the field (no shake). Esc / × clears the terminal's
   match decorations (paneSearchClear) and returns keyboard focus to the terminal
   (focusPaneTerminal). One bar at a time: useSearch holds a single openForPane,
   so opening search elsewhere unmounts this bar and its cleanup clears its marks.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { useSearch } from "../store/search";
import { paneSearch, paneSearchClear, focusPaneTerminal } from "../lib/terminal-session";
import { Icon } from "./icons";
import "../styles/search.css";

const DEBOUNCE_MS = 150;

export function TerminalSearch({ paneId }: { paneId: string }) {
  const open = useSearch((s) => s.openForPane === paneId);
  // Mount/unmount on open so local query + toggle state resets each session and
  // no hidden input ever holds focus while the bar is closed.
  return open ? <SearchBar paneId={paneId} /> : null;
}

function SearchBar({ paneId }: { paneId: string }) {
  const focusNonce = useSearch((s) => s.focusNonce);
  const close = useSearch((s) => s.close);

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [noResults, setNoResults] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  // Latest toggles for the debounced callback, so a settled search always uses
  // current options without re-arming the timer whenever a toggle flips.
  const optsRef = useRef({ caseSensitive, regex });
  optsRef.current = { caseSensitive, regex };

  // Focus + select on open, and again on every Ctrl+F re-press (nonce bump) —
  // e.g. after clicking back into the terminal with the bar still open.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusNonce]);

  // Safety net: clear the terminal's match decorations if the bar unmounts for
  // any reason (pane closed, search moved to another pane, tab teardown).
  useEffect(() => () => paneSearchClear(paneId), [paneId]);

  const runSearch = (q: string, dir: "next" | "prev", opts = optsRef.current) => {
    if (!q) {
      paneSearchClear(paneId);
      setNoResults(false);
      return;
    }
    setNoResults(!paneSearch(paneId, q, dir, opts));
  };

  // Debounced live search as the query changes; an empty query clears at once.
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (!query) {
      paneSearchClear(paneId);
      setNoResults(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setNoResults(!paneSearch(paneId, query, "next", optsRef.current));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, paneId]);

  const handleClose = () => {
    window.clearTimeout(debounceRef.current);
    paneSearchClear(paneId);
    close();
    focusPaneTerminal(paneId); // return keyboard focus to the terminal
  };

  const step = (dir: "next" | "prev") => {
    window.clearTimeout(debounceRef.current);
    runSearch(query, dir);
    inputRef.current?.focus();
  };

  const toggleCase = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    runSearch(query, "next", { caseSensitive: next, regex });
    inputRef.current?.focus();
  };
  const toggleRegex = () => {
    const next = !regex;
    setRegex(next);
    runSearch(query, "next", { caseSensitive, regex: next });
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Act on the current query immediately; don't wait out the debounce.
      e.preventDefault();
      e.stopPropagation();
      window.clearTimeout(debounceRef.current);
      runSearch(query, e.shiftKey ? "prev" : "next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    }
    // Other keys (typing, arrows) stay with the input; they can't reach the PTY
    // because the terminal isn't focused while this input holds focus.
  };

  return (
    <div className="term-search" role="search" onMouseDown={(e) => e.stopPropagation()}>
      <div className={`term-search-field${noResults ? " no-results" : ""}`}>
        <Icon name="ic-search" className="icon xs term-search-glyph" />
        <input
          ref={inputRef}
          className="term-search-input"
          type="text"
          value={query}
          placeholder="Find"
          aria-label="Find in terminal"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="term-search-toggles">
          <button
            type="button"
            className={`term-search-toggle${caseSensitive ? " active" : ""}`}
            aria-label="Match case"
            aria-pressed={caseSensitive}
            title="Match case"
            onClick={toggleCase}
          >
            Aa
          </button>
          <button
            type="button"
            className={`term-search-toggle${regex ? " active" : ""}`}
            aria-label="Use regular expression"
            aria-pressed={regex}
            title="Use regular expression"
            onClick={toggleRegex}
          >
            .*
          </button>
        </span>
      </div>

      <button
        type="button"
        className="term-search-btn"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        onClick={() => step("prev")}
      >
        <Icon name="ic-caret" className="icon xs up" />
      </button>
      <button
        type="button"
        className="term-search-btn"
        aria-label="Next match"
        title="Next match (Enter)"
        onClick={() => step("next")}
      >
        <Icon name="ic-caret" className="icon xs" />
      </button>

      <span className="term-search-sep" aria-hidden="true" />

      <button
        type="button"
        className="term-search-btn"
        aria-label="Close find bar"
        title="Close (Esc)"
        onClick={handleClose}
      >
        <Icon name="ic-close" className="icon xs" />
      </button>

      <span className="term-search-status" role="status" aria-live="polite">
        {noResults ? `No results for ${query}` : ""}
      </span>
    </div>
  );
}
