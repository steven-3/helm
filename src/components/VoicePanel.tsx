/* ══════════════════════════════════════════════════════════════════════════
   VoicePanel — voice-prompting settings (OVERHAUL-V4 §3.4 / useVoice).

   Pick + download a whisper model, point Helm at the whisper-cli binary and a
   model directory, choose an input device, toggle the LLM improve pass, and run
   a live test that shows the raw transcript beside the improved prompt.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { useVoice, type VoiceResult } from "../store/voice";
import { useModelHub } from "../store/modelhub";
import { fsExists } from "../lib/commands";
import { Icon } from "./icons";
import { VoiceButton } from "./VoiceButton";

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

      <div className="vp-caps">Paths</div>
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

      <div className="vp-caps">Input device</div>
      <div className="settings-card vp-device">
        <div className="vp-field vp-device-field">
          <select className="settings-select" value={device} onChange={(e) => setDevice(e.target.value)} aria-label="Microphone" disabled={devices.length === 0}>
            {devices.length === 0
              ? <option value="">System default</option>
              : <>
                  <option value="">System default</option>
                  {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>)}
                </>}
          </select>
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
          <select
            className="settings-select mono"
            value={improverModel}
            onChange={(e) => setSeat("voice-improver", e.target.value)}
            aria-label="Improver model"
            disabled={models.length === 0}
          >
            {improverModel === "" && <option value="">None</option>}
            {[...new Set([improverModel, ...models].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
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
