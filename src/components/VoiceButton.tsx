/* ══════════════════════════════════════════════════════════════════════════
   VoiceButton — standalone push-to-talk mic (OVERHAUL-V4 §3.4 / voice store).

   States: idle · recording (pulse + live timer) · transcribing (spinner) ·
   error. Click toggles capture. Default flow (no onText prop) pastes the final
   text into the active pane; a caller may intercept the result via onText
   (e.g. the Voice settings test row shows raw vs improved side-by-side).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { useVoice, type VoiceResult } from "../store/voice";
import { usePanes } from "../store/panes";
import { ptyWrite } from "../lib/commands";

/** Paste the final text into the active pane (the default sink). */
function pasteIntoActivePane(result: VoiceResult): void {
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  const paneId = tab?.activePaneId;
  if (paneId) void ptyWrite(paneId, result.text);
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

const MicGlyph = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <rect x="6" y="2" width="4" height="8" rx="2" fill="currentColor" />
    <path d="M4 7.5a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8 11.5V14M6 14h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const StopGlyph = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <rect x="4" y="4" width="8" height="8" rx="2" fill="currentColor" />
  </svg>
);

export function VoiceButton({
  onText,
  size = "md",
  showTimer = true,
  className = "",
}: {
  onText?: (result: VoiceResult) => void;
  size?: "sm" | "md";
  showTimer?: boolean;
  className?: string;
}) {
  const phase = useVoice((s) => s.phase);
  const level = useVoice((s) => s.level);
  const error = useVoice((s) => s.error);
  const start = useVoice((s) => s.start);
  const stop = useVoice((s) => s.stop);

  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const recording = phase === "recording";
  const busy = phase === "encoding" || phase === "transcribing" || phase === "improving";
  const errored = phase === "error";

  useEffect(() => {
    if (!recording) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(id);
  }, [recording]);

  const onClick = () => {
    if (recording) {
      void stop();
    } else if (!busy) {
      void start({ onText: onText ?? pasteIntoActivePane });
    }
  };

  const state = recording ? "recording" : busy ? "busy" : errored ? "error" : "idle";
  const label = recording
    ? "Stop recording"
    : busy
      ? phase === "improving" ? "Improving…" : phase === "transcribing" ? "Transcribing…" : "Encoding…"
      : errored ? "Recording failed — try again" : "Start voice prompt";

  return (
    <button
      type="button"
      className={`voice-btn ${size} ${className}`.trim()}
      data-state={state}
      aria-label={label}
      aria-pressed={recording}
      title={errored && error ? error : label}
      onClick={onClick}
      disabled={busy}
    >
      <span className="voice-btn-glyph" style={recording ? { transform: `scale(${1 + Math.min(level, 1) * 0.28})` } : undefined}>
        {recording ? <StopGlyph /> : busy ? <span className="voice-spinner" /> : <MicGlyph />}
      </span>
      {showTimer && recording && <span className="voice-btn-timer">{formatElapsed(elapsed)}</span>}
    </button>
  );
}
