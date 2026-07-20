/* ══════════════════════════════════════════════════════════════════════════
   Step 5 · Voice — one-click local whisper setup. voiceSetupWhisper() streams
   two-stage progress (binary, then model) on the "voice://download" event;
   on success the returned paths land in the voice store and a live mic test
   (the store's own capture → transcribe pipeline) proves the chain end to end.
   Errors surface the backend's message with a retry; skipping is always fine.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { voiceSetupWhisper, type VoiceSetupResult } from "../../../lib/ipc";
import { useVoice } from "../../../store/voice";
import { Icon } from "../../icons";
import { StepHeader } from "../shared";

type SetupPhase = "idle" | "busy" | "done" | "error";
type StageId = "binary" | "model";

interface StageProgress {
  received: number;
  total: number | null;
}

const EMPTY_STAGE: StageProgress = { received: 0, total: null };

/** The setup event shares the voice://download channel with model downloads;
    the stage field distinguishes the two legs of a full voice install. */
interface VoiceSetupEvent {
  stage?: string;
  received?: number;
  total?: number | null;
}

function percent({ received, total }: StageProgress): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((received / total) * 100));
}

function StageBar({
  name,
  state,
  progress,
}: {
  name: string;
  state: "waiting" | "active" | "done";
  progress: StageProgress;
}) {
  const pct = percent(progress);
  return (
    <div className="obv-stage" data-state={state}>
      <div className="obv-stage-head">
        <span className="obv-stage-name">{name}</span>
        <span className="obv-stage-state">
          {state === "done" ? (
            <>
              <Icon name="ic-check" size="xs" /> done
            </>
          ) : state === "active" ? (
            pct !== null ? `${pct}%` : "downloading…"
          ) : (
            "waiting"
          )}
        </span>
      </div>
      <div className="vp-progress" aria-hidden="true">
        <span
          style={pct !== null ? { width: `${pct}%` } : undefined}
          data-indeterminate={state === "active" && pct === null ? "" : undefined}
        />
      </div>
    </div>
  );
}

export function VoiceStep() {
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<StageId>("binary");
  const [binary, setBinary] = useState<StageProgress>(EMPTY_STAGE);
  const [model, setModel] = useState<StageProgress>(EMPTY_STAGE);
  const [result, setResult] = useState<VoiceSetupResult | null>(null);

  // Mic test — the voice store's own capture pipeline, reused as-is.
  const voicePhase = useVoice((s) => s.phase);
  const level = useVoice((s) => s.level);
  const voiceResult = useVoice((s) => s.result);
  const voiceError = useVoice((s) => s.error);
  const startCapture = useVoice((s) => s.start);
  const stopCapture = useVoice((s) => s.stop);

  const setup = async () => {
    setPhase("busy");
    setError(null);
    setStage("binary");
    setBinary(EMPTY_STAGE);
    setModel(EMPTY_STAGE);

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<VoiceSetupEvent>("voice://download", (event) => {
        const payload = event.payload;
        if (!payload) return;
        const next: StageProgress = {
          received: typeof payload.received === "number" ? payload.received : 0,
          total: typeof payload.total === "number" ? payload.total : null,
        };
        if (payload.stage === "model") {
          setStage("model");
          setBinary({ received: 1, total: 1 }); // the first leg finished
          setModel(next);
        } else {
          setBinary(next);
        }
      });
    } catch {
      // Browser dev has no Tauri event target — bars stay indeterminate.
    }

    try {
      const installed = await voiceSetupWhisper();
      // applyManagedSetup marks the pair as helm-managed and flips the store to
      // ready in one shot — the mic test below then drives the live pipeline.
      useVoice.getState().applyManagedSetup(installed.binaryPath, installed.modelPath);
      setResult(installed);
      setPhase("done");
    } catch (err) {
      setError(String(err));
      setPhase("error");
    } finally {
      unlisten?.();
    }
  };

  const toggleMic = () => {
    if (voicePhase === "recording") void stopCapture();
    else if (voicePhase === "idle" || voicePhase === "done" || voicePhase === "error") {
      void startCapture();
    }
  };

  return (
    <div>
      <StepHeader kicker="Step 5 of 6 · Voice" title="Talk to your terminals">
        Local whisper transcription — everything stays on your machine. One download now,
        then hold the mic button in any pane to dictate.
      </StepHeader>

      {phase === "idle" && (
        <div className="obv-cta">
          <button type="button" className="settings-button primary" onClick={() => void setup()}>
            <Icon name="ic-broadcast" size="sm" />
            Set up voice input
          </button>
          <p className="ob-hint">Downloads the whisper binary and a speech model (~200 MB).</p>
        </div>
      )}

      {phase === "busy" && (
        <div className="obv-stages" role="status" aria-label="Voice setup progress">
          <StageBar
            name="Whisper binary"
            state={stage === "binary" ? "active" : "done"}
            progress={binary}
          />
          <StageBar
            name="Speech model"
            state={stage === "model" ? (result ? "done" : "active") : "waiting"}
            progress={model}
          />
        </div>
      )}

      {phase === "error" && (
        <>
          <div className="settings-note ob-err" role="alert">
            <Icon name="ic-alert" size="sm" />
            Voice setup didn’t finish — {error}
          </div>
          <div className="obv-cta">
            <button type="button" className="settings-button ghost" onClick={() => void setup()}>
              Try again
            </button>
          </div>
        </>
      )}

      {phase === "done" && result && (
        <>
          <div className="settings-note info" role="status">
            <Icon name="ic-check" size="sm" />
            Voice input is ready — whisper-cli and the speech model are installed.
          </div>
          <div className="obv-paths">
            <span className="obv-path">{result.binaryPath}</span>
            <span className="obv-path">{result.modelPath}</span>
          </div>

          <div className="obv-test">
            <div className="obv-test-head">
              <div className="obv-test-copy">
                <strong>Test your mic</strong>
                <small>Record a phrase — Helm transcribes it locally, nothing leaves the machine.</small>
              </div>
              <button
                type="button"
                className="settings-button"
                data-state={voicePhase === "recording" ? "recording" : undefined}
                disabled={voicePhase === "encoding" || voicePhase === "transcribing" || voicePhase === "improving"}
                onClick={toggleMic}
              >
                <Icon name="ic-broadcast" size="sm" />
                {voicePhase === "recording" ? "Stop" : "Test mic"}
              </button>
            </div>

            {voicePhase === "recording" && (
              <div className="obv-meter" aria-hidden="true">
                <span style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            )}
            {(voicePhase === "encoding" || voicePhase === "transcribing" || voicePhase === "improving") && (
              <p className="obv-phase" role="status">
                {voicePhase === "encoding" ? "Encoding…" : voicePhase === "transcribing" ? "Transcribing…" : "Tidying…"}
              </p>
            )}
            {voicePhase === "done" && voiceResult && (
              <p className="obv-result">“{voiceResult.text}”</p>
            )}
            {voicePhase === "error" && voiceError && (
              <div className="ob-error" role="alert">
                <Icon name="ic-alert" size="xs" />
                {voiceError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
