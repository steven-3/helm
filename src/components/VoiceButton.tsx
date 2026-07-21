/* VoiceButton — shared capture control. The default path keeps terminal delivery;
   popout opts into external delivery and Settings may intercept the result. */
import { useEffect, useRef, useState } from "react";
import { useVoice, type VoiceResult } from "../store/voice";
import { deliverVoiceResult } from "../lib/voice-delivery";
import { Icon } from "./icons";
import { VoiceWaveform } from "./VoiceWaveform";
import "./VoiceMode.css";

export function formatVoiceElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function VoiceButton({
  onText,
  size = "md",
  showTimer = true,
  external = false,
  className = "",
}: {
  onText?: (result: VoiceResult) => void;
  size?: "sm" | "md";
  showTimer?: boolean;
  external?: boolean;
  className?: string;
}) {
  const phase = useVoice((state) => state.phase);
  const error = useVoice((state) => state.error);
  const start = useVoice((state) => state.start);
  const stop = useVoice((state) => state.stop);
  const cancel = useVoice((state) => state.cancel);

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

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancel, recording]);

  const deliver = (result: VoiceResult) => {
    void deliverVoiceResult(result, { external, onText });
  };

  const onClick = () => {
    if (recording) void stop();
    else if (!busy) void start({ onText: deliver });
  };

  const state = recording ? "recording" : busy ? "busy" : errored ? "error" : "idle";
  const label = recording
    ? "Stop and send recording"
    : busy
      ? phase === "improving" ? "Improving transcript" : phase === "transcribing" ? "Transcribing recording" : "Encoding recording"
      : errored ? "Recording failed. Try again" : "Start voice prompt";

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
      <span className="voice-btn-glyph">
        {recording ? <Icon name="ic-stop" size="xs" /> : busy ? <span className="voice-spinner" /> : <Icon name="ic-mic" size="sm" />}
      </span>
      {recording && (
        <span className="voice-recording-detail">
          <VoiceWaveform bars={size === "sm" ? 26 : 32} className="voice-btn-wave" />
          {(showTimer || size === "sm") && <span className="voice-btn-timer">{formatVoiceElapsed(elapsed)}</span>}
          <span className="voice-cancel-hint"><kbd className="kbd">Esc</kbd><span>cancel</span></span>
        </span>
      )}
      {busy && <span className="voice-busy-label">{phase === "improving" ? "Improving" : phase === "transcribing" ? "Transcribing" : "Encoding"}</span>}
    </button>
  );
}
