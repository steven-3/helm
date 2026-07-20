/* ══════════════════════════════════════════════════════════════════════════
   DigestCard (§4.9 · U3) — the Flight Recorder "since you looked away" catch-up
   for one session. Props: { sessionId, sinceTs }.

   Calls useRecorder.digest(sessionId, sinceTs) on mount / prop change (LLM
   summary through the proxy, graceful fallback when it is down). While it
   resolves, a shimmer skeleton holds the layout; then it renders the one-line
   summary, a commands / files / errors stat row, the last few commands (mono),
   the first error signals, and a jump-to-session button. A window with no
   signals degrades to a quiet "nothing recorded" line — never a broken card.

   T1 raised (.elev-1) with a seat identity edge (§13.3). Exported clean so Fleet
   Home (U1) can drop one per session card. Product surface: quiet tier, tokens
   only; the shimmer is a loading-state indicator (the sanctioned exception to
   the motion frequency gate, like the search spinner).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { useRecorder, type SessionDigest } from "../store/recorder";
import { usePanes } from "../store/panes";
import { useModelHub } from "../store/modelhub";
import { revealPane } from "../lib/dispatch";
import { seatHueFor } from "./BoardCard";
import { Icon } from "./icons";
import "../styles/attention.css";

function relTime(ts: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const COMMAND_TAIL = 4;
const ERROR_TAIL = 2;

export function DigestCard({ sessionId, sinceTs }: { sessionId: string; sinceTs: number }) {
  const digestFn = useRecorder((s) => s.digest);
  const pane = usePanes((s) => s.panes[sessionId]);
  const seats = useModelHub((s) => s.seats);

  const [digest, setDigest] = useState<SessionDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const now = Date.now();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDigest(null);
    void digestFn(sessionId, sinceTs).then((result) => {
      if (!cancelled) {
        setDigest(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [digestFn, sessionId, sinceTs]);

  const hue = seatHueFor(pane?.model ?? pane?.agent, seats);
  const title = pane?.title ?? sessionId;

  const commandCount = digest?.commands.length ?? 0;
  const fileCount = digest?.filesTouched.length ?? 0;
  const errorCount = digest?.errors.length ?? 0;
  const quiet = !loading && commandCount === 0 && fileCount === 0 && errorCount === 0;

  return (
    <article className="dg-card" data-seat={hue} aria-label={`Digest for ${title}`}>
      <header className="dg-head">
        <div className="dg-head-main">
          <span className="dg-head-label">Since you looked away</span>
          <span className="dg-head-when tnum">{relTime(sinceTs, now)}</span>
        </div>
        <button
          type="button"
          className="dg-jump"
          onClick={() => revealPane(sessionId)}
          aria-label={`Jump to ${title}`}
          disabled={!pane}
        >
          <Icon name="ic-external" size="xs" className="icon" />
          Open
        </button>
      </header>

      <div className="dg-session" data-seat={hue}>
        <i className="seat-dot" aria-hidden="true" />
        <span className="dg-session-name">{title}</span>
      </div>

      {loading ? (
        <div className="dg-shimmer" aria-hidden="true">
          <span className="dg-sk dg-sk-wide" />
          <span className="dg-sk dg-sk-mid" />
          <span className="dg-sk dg-sk-row" />
        </div>
      ) : (
        <>
          <p className="dg-summary">{digest?.summaryMd}</p>

          {quiet ? (
            <div className="dg-quiet">Nothing recorded in this window.</div>
          ) : (
            <>
              <div className="dg-stats" role="list">
                <span className="dg-stat" role="listitem">
                  <Icon name="ic-shell" size="xs" className="icon dg-stat-ic" />
                  <span className="dg-stat-n tnum">{commandCount}</span>
                  <span className="dg-stat-l">{commandCount === 1 ? "command" : "commands"}</span>
                </span>
                <span className="dg-stat" role="listitem">
                  <Icon name="ic-files" size="xs" className="icon dg-stat-ic" />
                  <span className="dg-stat-n tnum">{fileCount}</span>
                  <span className="dg-stat-l">{fileCount === 1 ? "file" : "files"}</span>
                </span>
                <span
                  className={`dg-stat${errorCount > 0 ? " danger" : ""}`}
                  role="listitem"
                >
                  <Icon name="ic-alert" size="xs" className="icon dg-stat-ic" />
                  <span className="dg-stat-n tnum">{errorCount}</span>
                  <span className="dg-stat-l">{errorCount === 1 ? "error" : "errors"}</span>
                </span>
              </div>

              {commandCount > 0 && (
                <ul className="dg-cmds" aria-label="Recent commands">
                  {digest!.commands.slice(-COMMAND_TAIL).map((cmd, i) => (
                    <li key={i} className="dg-cmd mono" title={cmd}>
                      <span className="dg-cmd-mark" aria-hidden="true">$</span>
                      {cmd}
                    </li>
                  ))}
                </ul>
              )}

              {errorCount > 0 && (
                <ul className="dg-errs" aria-label="Error signals">
                  {digest!.errors.slice(0, ERROR_TAIL).map((err, i) => (
                    <li key={i} className="dg-err mono" title={err}>
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}
