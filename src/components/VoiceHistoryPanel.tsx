import { useEffect, useState } from "react";
import { clipboardWrite } from "../lib/commands";
import { useVoiceHistory, type VoiceHistoryEntry } from "../store/voicehistory";
import { Icon } from "./icons";
import "./VoiceMode.css";

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}

function durationLabel(durationMs?: number): string | null {
  if (durationMs === undefined) return null;
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds}s`;
}

function TranscriptBlock({
  entry,
  kind,
  text,
  copyState,
  onCopy,
}: {
  entry: VoiceHistoryEntry;
  kind: "raw" | "improved";
  text: string;
  copyState: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const key = `${entry.id}:${kind}`;
  const copied = copyState === key;
  const failed = copyState === `${key}:error`;
  return (
    <div className="voice-history-transcript" data-kind={kind}>
      <div className="voice-history-transcript-head">
        <span>{kind === "raw" ? "Raw" : "Improved"}</span>
        <button type="button" className="voice-history-icon-button" onClick={() => onCopy(key, text)} aria-label={`Copy ${kind} transcript`}>
          <Icon name={copied ? "ic-check" : "ic-copy"} size="xs" />
        </button>
      </div>
      <p>{text}</p>
      {failed && <span className="voice-history-copy-error" role="alert">Copy failed</span>}
    </div>
  );
}

export function VoiceHistoryPanel() {
  const entries = useVoiceHistory((state) => state.entries);
  const remove = useVoiceHistory((state) => state.remove);
  const clear = useVoiceHistory((state) => state.clear);
  const [now, setNow] = useState(Date.now());
  const [copyState, setCopyState] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!clearArmed) return;
    const id = window.setTimeout(() => setClearArmed(false), 3_000);
    return () => window.clearTimeout(id);
  }, [clearArmed]);

  const copy = async (key: string, text: string) => {
    try {
      await clipboardWrite(text);
      setCopyState(key);
    } catch {
      setCopyState(`${key}:error`);
    }
    window.setTimeout(() => setCopyState(null), 1_800);
  };

  const clearAll = () => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    clear();
    setClearArmed(false);
  };

  return (
    <div className="voice-history-panel">
      <header className="side-head voice-history-head">
        <div>
          <h2 className="side-title">Voice history</h2>
          <span className="side-count tnum">{entries.length}</span>
        </div>
        <button
          type="button"
          className="voice-history-clear"
          data-armed={clearArmed || undefined}
          onClick={clearAll}
          disabled={entries.length === 0}
        >
          {clearArmed ? "Confirm clear" : "Clear all"}
        </button>
      </header>

      {entries.length === 0 ? (
        <div className="voice-history-empty">
          <Icon name="ic-history" />
          <strong>No voice prompts yet</strong>
          <p>Completed recordings appear here with raw and improved text.</p>
        </div>
      ) : (
        <div className="voice-history-list">
          {entries.map((entry) => {
            const duration = durationLabel(entry.durationMs);
            return (
              <article className="voice-history-entry" key={entry.id}>
                <header>
                  <span className="voice-history-time tnum" title={new Date(entry.ts).toLocaleString()}>{relativeTime(entry.ts, now)}</span>
                  <span className="voice-history-mode">{entry.mode === "prompt" ? "Prompt" : "Regular"}</span>
                  {duration && <span className="voice-history-duration tnum">{duration}</span>}
                  <button type="button" className="voice-history-icon-button danger" onClick={() => remove(entry.id)} aria-label="Delete voice history entry">
                    <Icon name="ic-trash" size="xs" />
                  </button>
                </header>
                <TranscriptBlock entry={entry} kind="raw" text={entry.raw} copyState={copyState} onCopy={copy} />
                {entry.improved && entry.improved !== entry.raw && (
                  <TranscriptBlock entry={entry} kind="improved" text={entry.improved} copyState={copyState} onCopy={copy} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
