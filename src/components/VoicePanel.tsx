/* ══════════════════════════════════════════════════════════════════════════
   VoicePanel — voice-prompting settings (OVERHAUL-V4 §3.4 / useVoice).

   Pick + download a whisper model, point Helm at the whisper-cli binary and a
   model directory, choose an input device, toggle the LLM improve pass, and run
   a live test that shows the raw transcript beside the improved prompt.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useVoice, type VoiceResult } from "../store/voice";
import { useModelHub } from "../store/modelhub";
import { fsExists } from "../lib/commands";
import { voiceSetupWhisper } from "../lib/ipc";
import { Icon } from "./icons";
import { VoiceButton } from "./VoiceButton";
import { Dropdown } from "./ui/Dropdown";

interface WhisperModel {
  id: string;
  label: string;
  size: string;
  note: string;
}

/** ggml whisper models the Rust downloader fetches (voice_download_model). */
const WHISPER_MODELS: WhisperModel[] = [
  { id: "tiny", label: "Tiny", size: "75 MB", note: "Fastest, lower accuracy" },
  { id: "base", label: "Base", size: "142 MB", note: "Balanced" },
  { id: "small", label: "Small", size: "466 MB", note: "Most accurate, slower" },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}

const isPathLike = (value: string) => value.includes("/") || value.includes("\\");

/** Debounced filesystem existence check; skips bare command names (PATH lookups). */
function useExistence(path: string): boolean | null {
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    const trimmed = path.trim();
    if (!trimmed || !isPathLike(trimmed)) { setExists(null); return; }
    let live = true;
    const id = window.setTimeout(() => {
      fsExists(trimmed).then((v) => { if (live) setExists(v); }).catch(() => { if (live) setExists(null); });
    }, 350);
    return () => { live = false; window.clearTimeout(id); };
  }, [path]);
  return exists;
}

function PathState({ exists }: { exists: boolean | null }) {
  if (exists === null) return null;
  return exists
    ? <span className="vp-path-ok"><Icon name="ic-check" size="xs" />Found</span>
    : <span className="vp-path-bad"><Icon name="ic-alert" size="xs" />Not found</span>;
}

/* ── one-button managed setup (v0.5) ────────────────────────────────────────
   voiceSetupWhisper() downloads the whisper-cli binary + a ggml model into
   Helm's data directory; progress rides the shared "voice://download" channel
   with a `stage` discriminator ("binary" | "model"), which keeps it apart from
   the per-model download stream (those events carry `modelId` instead). */
type SetupStageId = "binary" | "model";

interface SetupProgress {
  received: number;
  total: number | null;
}

function readSetupStage(payload: unknown): { stage: SetupStageId; received: number; total: number | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.stage !== "binary" && p.stage !== "model") return null;
  const received = typeof p.received === "number" && p.received > 0 ? p.received : 0;
  const total = typeof p.total === "number" && p.total > 0 ? p.total : null;
  return { stage: p.stage, received, total };
}

function SetupStageRow({ label, progress, done }: { label: string; progress: SetupProgress | null; done: boolean }) {
  const waiting = progress === null && !done;
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;
  const meta = done
    ? "Done"
    : waiting
      ? "Waiting"
      : pct !== null
        ? `${pct}%`
        : progress && progress.received > 0
          ? `${Math.round(progress.received / 1_000_000)} MB`
          : "Starting";
  return (
    <div className="vp-stage" data-state={done ? "done" : waiting ? "wait" : "run"}>
      <span className="vp-stage-head">
        <span className="vp-stage-icon">{done ? <Icon name="ic-check" size="xs" /> : waiting ? null : <span className="voice-spinner" />}</span>
        <span className="vp-stage-label">{label}</span>
        <span className="vp-stage-meta tnum">{meta}</span>
      </span>
      <div className="vp-progress">
        <span style={{ width: done ? "100%" : `${pct ?? 30}%` }} data-indeterminate={(!done && pct === null) || undefined} />
      </div>
    </div>
  );
}

export function VoicePanel() {
  const binaryPath = useVoice((s) => s.binaryPath);
  const modelPath = useVoice((s) => s.modelPath);
  const modelDir = useVoice((s) => s.modelDir);
  const rawMode = useVoice((s) => s.rawMode);
  const download = useVoice((s) => s.download);
  const phase = useVoice((s) => s.phase);
  const error = useVoice((s) => s.error);
  const setBinaryPath = useVoice((s) => s.setBinaryPath);
  const setModelPath = useVoice((s) => s.setModelPath);
  const setModelDir = useVoice((s) => s.setModelDir);
  const setRawMode = useVoice((s) => s.setRawMode);
  const downloadModel = useVoice((s) => s.downloadModel);
  const applyManagedSetup = useVoice((s) => s.applyManagedSetup);

  const models = useModelHub((s) => s.models);
  // Mirror voice.ts's engine choice reactively: first pinned seat model, else
  // the first probed model. Subscribing to seats keeps the dropdown honest.
  const firstPinned = useModelHub((s) => Object.values(s.seats).find(Boolean) ?? "");
  const setSeat = useModelHub((s) => s.setSeat);

  const binExists = useExistence(binaryPath);
  const modelExists = useExistence(modelPath);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [testResult, setTestResult] = useState<VoiceResult | null>(null);

  /* managed setup (binary → model → applyManagedSetup) */
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState<Record<SetupStageId, SetupProgress | null>>({ binary: null, model: null });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const unlistenSetup = useRef<(() => void) | null>(null);

  useEffect(() => () => { unlistenSetup.current?.(); }, []);

  const configured = binaryPath.trim() !== "" && modelPath.trim() !== "";
  const binaryDone = setupProgress.binary !== null
    && (setupProgress.model !== null
      || (setupProgress.binary.total !== null && setupProgress.binary.received >= setupProgress.binary.total));
  const modelDone = setupProgress.model !== null
    && setupProgress.model.total !== null
    && setupProgress.model.received >= setupProgress.model.total;

  const runSetup = async () => {
    if (setupRunning) return;
    setSetupRunning(true);
    setSetupError(null);
    setSetupProgress({ binary: null, model: null });
    unlistenSetup.current?.();
    try {
      unlistenSetup.current = await listen("voice://download", (event) => {
        const stage = readSetupStage(event.payload);
        if (!stage) return;
        setSetupProgress((prev) => ({ ...prev, [stage.stage]: { received: stage.received, total: stage.total } }));
      });
    } catch {
      unlistenSetup.current = null; /* browser dev has no Tauri event target */
    }
    try {
      const result = await voiceSetupWhisper();
      applyManagedSetup(result.binaryPath, result.modelPath);
    } catch (err) {
      setSetupError(String(err));
    } finally {
      unlistenSetup.current?.();
      unlistenSetup.current = null;
      setSetupRunning(false);
    }
  };

  const improve = !rawMode;
  const improverModel = firstPinned || models[0] || "";
  const downloading = download && !download.done;
  const downloadPct = download && download.total ? Math.round((download.received / download.total) * 100) : null;

  const loadDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch {
      setDevices([]);
    }
  };

  return (
    <div className="vp">
      <div className="vp-caps">Voice input</div>
      <div className="settings-card vp-setup">
        {setupRunning ? (
          <div className="vp-setup-run" aria-live="polite">
            <div className="settings-row-title">Setting up voice input</div>
            <SetupStageRow label="whisper-cli binary" progress={setupProgress.binary} done={binaryDone} />
            <SetupStageRow label="Speech model" progress={setupProgress.model} done={modelDone} />
          </div>
        ) : configured ? (
          <div className="vp-setup-row">
            <span className="vp-setup-badge"><Icon name="ic-check" size="xs" /></span>
            <div className="settings-card-copy">
              <div className="settings-row-title">Voice input is ready</div>
              <div className="settings-row-desc">Hold the mic button in any pane to dictate. Helm manages the binary and model paths.</div>
            </div>
            <button type="button" className="settings-button ghost" onClick={() => void runSetup()}>Re-run setup</button>
          </div>
        ) : (
          <div className="vp-setup-row">
            <div className="settings-card-copy">
              <div className="settings-row-title">One-step setup</div>
              <div className="settings-row-desc">Downloads the whisper-cli binary and a speech model into Helm's data directory, then wires both paths automatically.</div>
            </div>
            <button type="button" className="settings-button primary" onClick={() => void runSetup()}>
              Set up voice input
            </button>
          </div>
        )}
        {!setupRunning && setupError && (
          <div className="vp-setup-error" role="alert"><Icon name="ic-alert" size="xs" />{setupError}</div>
        )}
      </div>

      <div className="vp-adv">
        <button type="button" className="vp-adv-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)}>
          <Icon name="ic-chev" size="xs" className="vp-adv-chev icon" />
          <span className="vp-adv-name">Advanced</span>
          <span className="vp-adv-hint">whisper binary, model file, download directory</span>
        </button>
        {advancedOpen && (
          <div className="settings-card vp-paths">
            <div className="vp-field">
              <label>Whisper binary <PathState exists={binExists} /></label>
              <input className="mh-input mono" value={binaryPath} spellCheck={false} onChange={(e) => setBinaryPath(e.target.value)} placeholder="whisper-cli" aria-label="Whisper binary path" />
            </div>
            <div className="vp-field">
              <label>Model file <PathState exists={modelExists} /></label>
              <input className="mh-input mono" value={modelPath} spellCheck={false} onChange={(e) => setModelPath(e.target.value)} placeholder="/path/to/ggml-base.bin" aria-label="Model file path" />
            </div>
            <div className="vp-field">
              <label>Model download directory</label>
              <input className="mh-input mono" value={modelDir} spellCheck={false} onChange={(e) => setModelDir(e.target.value)} placeholder="~/.helm/whisper" aria-label="Model directory" />
            </div>
          </div>
        )}
      </div>

      <div className="vp-caps">Whisper model</div>
      <div className="settings-card vp-models">
        {WHISPER_MODELS.map((model) => {
          const active = download?.modelId === model.id;
          return (
            <div className="vp-model-row" key={model.id}>
              <div className="vp-model-copy">
                <div className="vp-model-name">{model.label} <span className="vp-model-size">{model.size}</span></div>
                <div className="vp-model-note">{model.note}</div>
              </div>
              <button
                type="button"
                className="settings-button ghost"
                onClick={() => void downloadModel(model.id)}
                disabled={Boolean(downloading)}
              >
                <Icon name="ic-external" size="xs" />
                {active && downloading ? "Downloading…" : "Download"}
              </button>
            </div>
          );
        })}
        {download && (
          <div className="vp-download">
            {download.error ? (
              <div className="vp-path-bad"><Icon name="ic-alert" size="xs" />{download.error}</div>
            ) : download.done ? (
              <div className="vp-path-ok"><Icon name="ic-check" size="xs" />{download.modelId} ready</div>
            ) : (
              <>
                <div className="vp-progress"><span style={{ width: `${downloadPct ?? 30}%` }} data-indeterminate={downloadPct === null || undefined} /></div>
                <span className="vp-progress-label">{downloadPct !== null ? `${downloadPct}%` : `${Math.round(download.received / 1_000_000)} MB`}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="vp-caps">Input device</div>
      <div className="settings-card vp-device">
        <div className="vp-field vp-device-field">
          <Dropdown
            value={device}
            options={[
              { value: "", label: "System default" },
              ...devices.map((d) => ({ value: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}` })),
            ]}
            onChange={setDevice}
            disabled={devices.length === 0}
            ariaLabel="Microphone"
          />
          <button type="button" className="settings-button ghost" onClick={() => void loadDevices()}>Detect microphones</button>
        </div>
        <p className="vp-hint">Capture runs at 16 kHz mono. Grant microphone access once so device names appear.</p>
      </div>

      <div className="vp-caps">Prompt improvement</div>
      <div className="settings-card settings-row-card vp-improve">
        <div className="settings-card-copy">
          <div className="settings-row-title">Improve prompt with an LLM</div>
          <div className="settings-row-desc">Rewrites the raw transcript into a cleaner prompt through the proxy. Falls back to the raw transcript on any failure.</div>
        </div>
        <Toggle checked={improve} onChange={(v) => setRawMode(!v)} label="Improve prompt with an LLM" />
      </div>
      {improve && (
        <div className="settings-card settings-row-card vp-improver">
          <div className="settings-card-copy">
            <div className="settings-row-title">Improver model</div>
            <div className="settings-row-desc">
              {models.length === 0 ? "Probe a proxy under Models to load engines." : "Runs the rewrite. A pinned seat model takes priority."}
            </div>
          </div>
          <Dropdown
            className="mono"
            value={improverModel}
            options={[
              ...(improverModel === "" ? [{ value: "", label: "None" }] : []),
              ...[...new Set([improverModel, ...models].filter(Boolean))].map((m) => ({ value: m, label: m })),
            ]}
            onChange={(v) => setSeat("voice-improver", v)}
            disabled={models.length === 0}
            ariaLabel="Improver model"
          />
        </div>
      )}

      <div className="vp-caps">Test recording</div>
      <div className="settings-card vp-test">
        <div className="vp-test-head">
          <VoiceButton onText={setTestResult} />
          <div className="vp-test-copy">
            <strong>Hold to talk</strong>
            <small>{phase === "error" && error ? error : "Records, transcribes, and (if on) improves — nothing is pasted here."}</small>
          </div>
        </div>
        {testResult && (
          <div className="vp-test-out">
            <div className="vp-test-col">
              <div className="vp-caps">Raw transcript</div>
              <p className="vp-test-text mono">{testResult.rawTranscript || "—"}</p>
            </div>
            <div className="vp-test-col">
              <div className="vp-caps">{testResult.improved ? "Improved" : "Result"}</div>
              <p className="vp-test-text">{testResult.text || "—"}</p>
              {!testResult.improved && !rawMode && <span className="vp-test-flag">improvement unavailable — using raw</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
