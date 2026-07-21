import { useEffect, useRef, useState } from "react";
import { voicePopoutClose } from "../lib/ipc";
import { useVoice } from "../store/voice";
import { Icon, IconSprite } from "./icons";
import { formatVoiceElapsed, VoiceButton } from "./VoiceButton";
import { VoiceWaveform } from "./VoiceWaveform";
import "./VoiceMode.css";

export function VoicePopout() {
  const phase = useVoice((state) => state.phase);
  const error = useVoice((state) => state.error);
  const cancel = useVoice((state) => state.cancel);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const recording = phase === "recording";

  useEffect(() => {
    document.documentElement.setAttribute("data-voice-popout", "true");
    return () => document.documentElement.removeAttribute("data-voice-popout");
  }, []);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(id);
  }, [recording]);

  const close = async () => {
    if (recording) cancel();
    try { await voicePopoutClose(); }
    catch { window.close(); }
  };

  const status = phase === "recording" ? "Listening"
    : phase === "encoding" ? "Preparing audio"
      : phase === "transcribing" ? "Transcribing"
        : phase === "improving" ? "Improving prompt"
          : phase === "error" ? (error || "Recording failed")
            : phase === "done" ? "Inserted into the active app"
              : "Ready";

  return (
    <div className="voice-popout" data-state={phase}>
      <IconSprite />
      <div className="voice-popout-drag" data-tauri-drag-region aria-hidden="true" />
      <VoiceButton external size="sm" showTimer={false} className="voice-popout-mic" />
      <div className="voice-popout-main">
        <VoiceWaveform bars={38} className="voice-popout-wave" />
        <div className="voice-popout-status">
          <span className="voice-popout-status-text">{status}</span>
          {recording && <><span className="voice-popout-time tnum">{formatVoiceElapsed(elapsed)}</span><span className="voice-popout-esc"><kbd className="kbd">Esc</kbd> cancel</span></>}
        </div>
      </div>
      <button type="button" className="voice-popout-close" aria-label="Close voice popout" onClick={() => void close()}>
        <Icon name="ic-close" size="xs" />
      </button>
    </div>
  );
}
