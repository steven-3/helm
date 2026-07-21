import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { useVoice, type VoiceResult } from "../store/voice";
import { useModelHub } from "../store/modelhub";
import { fsExists } from "../lib/commands";
import { voicePopoutOpen, voiceSetupWhisper } from "../lib/ipc";
import { Icon } from "./icons";
import { VoiceButton } from "./VoiceButton";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { Dropdown } from "./ui/Dropdown";
import "./VoiceMode.css";

interface WhisperModel {
  id: string;
  label: string;
  size: string;
  note: string;
}

const WHISPER_MODELS: WhisperModel[] = [
  { id: "tiny", label: "Tiny", size: "75 MB", note: "Fastest, lower accuracy" },
  { id: "base", label: "Base", size: "142 MB", note: "Balanced" },
  { id: "small", label: "Small", size: "466 MB", note: "Most accurate, slower" },
];

const EFFORTS = ["low", "medium", "high"] as const;
type Effort = typeof EFFORTS[number];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}

const isPathLike = (value: string) => value.includes("/") || value.includes("\\");

function useExistence(path: string): boolean | null {
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    const trimmed = path.trim();
    if (!trimmed || !isPathLike(trimmed)) { setExists(null); return; }
    let live = true;
    const id = window.setTimeout(() => {
      fsExists(trimmed).then((value) => { if (live) setExists(value); }).catch(() => { if (live) setExists(null); });
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

type SetupStageId = "binary" | "model";
interface SetupProgress { received: number; total: number | null }

function readSetupStage(payload: unknown): { stage: SetupStageId; received: number; total: number | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (value.stage !== "binary" && value.stage !== "model") return null;
  const received = typeof value.received === "number" && value.received > 0 ? value.received : 0;
  const total = typeof value.total === "number" && value.total > 0 ? value.total : null;
  return { stage: value.stage, received, total };
}

function SetupStageRow({ label, progress, done }: { label: string; progress: SetupProgress | null; done: boolean }) {
  const waiting = progress === null && !done;
  const pct = progress?.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;
  const meta = done ? "Done" : waiting ? "Waiting" : pct !== null ? `${pct}%` : progress?.received ? `${Math.round(progress.received / 1_000_000)} MB` : "Starting";
  return (
    <div className="vp-stage" data-state={done ? "done" : waiting ? "wait" : "run"}>
      <span className="vp-stage-head">
        <span className="vp-stage-icon">{done ? <Icon name="ic-check" size="xs" /> : waiting ? null : <span className="voice-spinner" />}</span>
        <span className="vp-stage-label">{label}</span>
        <span className="vp-stage-meta tnum">{meta}</span>
      </span>
      <div className="vp-progress"><span style={{ width: done ? "100%" : `${pct ?? 30}%` }} data-indeterminate={(!done && pct === null) || undefined} /></div>
    </div>
  );
}

function cleanDeviceLabel(label: string, fallback: string): string {
  const cleaned = label
    .replace(/ \([0-9a-f]{4}:[0-9a-f]{4}\)$/i, "")
    .replace(/\s+\((?:VID|PID)[^)]*\)$/i, "")
    .trim();
  return cleaned || fallback;
}

export function VoicePanel() {
  const binaryPath = useVoice((state) => state.binaryPath);
  const modelPath = useVoice((state) => state.modelPath);
  const modelDir = useVoice((state) => state.modelDir);
  const rawMode = useVoice((state) => state.rawMode);
  const download = useVoice((state) => state.download);
  const phase = useVoice((state) => state.phase);
  const error = useVoice((state) => state.error);
  const improveMode = useVoice((state) => state.improveMode);
  const improverEffort = useVoice((state) => state.improverEffort);
  const deviceId = useVoice((state) => state.deviceId);
  const toggleShortcut = useVoice((state) => state.toggleShortcut);
  const holdShortcut = useVoice((state) => state.holdShortcut);
  const setBinaryPath = useVoice((state) => state.setBinaryPath);
  const setModelPath = useVoice((state) => state.setModelPath);
  const setModelDir = useVoice((state) => state.setModelDir);
  const setRawMode = useVoice((state) => state.setRawMode);
  const setImproveMode = useVoice((state) => state.setImproveMode);
  const setImproverEffort = useVoice((state) => state.setImproverEffort);
  const setDeviceId = useVoice((state) => state.setDeviceId);
  const setToggleShortcut = useVoice((state) => state.setToggleShortcut);
  const setHoldShortcut = useVoice((state) => state.setHoldShortcut);
  const downloadModel = useVoice((state) => state.downloadModel);
  const applyManagedSetup = useVoice((state) => state.applyManagedSetup);

  const models = useModelHub((state) => state.models);
  const improverModel = useModelHub((state) => state.seats["voice-improver"] ?? "");
  const setSeat = useModelHub((state) => state.setSeat);

  const binExists = useExistence(binaryPath);
  const modelExists = useExistence(modelPath);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<VoiceResult | null>(null);
  const [popoutError, setPopoutError] = useState<string | null>(null);

  const [setupRunning, setSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState<Record<SetupStageId, SetupProgress | null>>({ binary: null, model: null });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const unlistenSetup = useRef<(() => void) | null>(null);

  useEffect(() => () => { unlistenSetup.current?.(); }, []);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDeviceError(null);
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((device) => device.kind === "audioinput"));
    } catch (loadError) {
      setDevices([]);
      setDeviceError(String(loadError));
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
  }, [loadDevices]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setTimeout(() => void loadDevices(), 200);
    return () => window.clearTimeout(id);
  }, [loadDevices, phase]);

  const configured = binaryPath.trim() !== "" && modelPath.trim() !== "";
  const binaryDone = setupProgress.binary !== null
    && (setupProgress.model !== null || (setupProgress.binary.total !== null && setupProgress.binary.received >= setupProgress.binary.total));
  const modelDone = setupProgress.model !== null && setupProgress.model.total !== null && setupProgress.model.received >= setupProgress.model.total;

  const runSetup = async () => {
    if (setupRunning) return;
    setSetupRunning(true);
    setSetupError(null);
    setSetupProgress({ binary: null, model: null });
    unlistenSetup.current?.();
    try {
      unlistenSetup.current = await listen("voice://download", (event) => {
        const stage = readSetupStage(event.payload);
        if (stage) setSetupProgress((previous) => ({ ...previous, [stage.stage]: { received: stage.received, total: stage.total } }));
      });
    } catch {
      unlistenSetup.current = null;
    }
    try {
      const result = await voiceSetupWhisper();
      applyManagedSetup(result.binaryPath, result.modelPath);
    } catch (setupFailure) {
      setSetupError(String(setupFailure));
    } finally {
      unlistenSetup.current?.();
      unlistenSetup.current = null;
      setSetupRunning(false);
    }
  };

  const improve = !rawMode;
  const downloading = download && !download.done;
  const downloadPct = download?.total ? Math.round((download.received / download.total) * 100) : null;
  const effortIndex = Math.max(0, EFFORTS.indexOf(improverEffort as Effort));
  const deviceOptions = [
    { value: "", label: "System default" },
    ...devices.map((device, index) => ({
      value: device.deviceId,
      label: cleanDeviceLabel(device.label, `Microphone ${index + 1}`),
    })),
  ];
  const modelOptions = models.map((model) => ({ value: model, label: model }));

  const openPopout = async () => {
    setPopoutError(null);
    try { await voicePopoutOpen(); }
    catch (openError) { setPopoutError(String(openError)); }
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
              <div className="settings-row-desc">Hold the mic control anywhere in Helm to dictate.</div>
            </div>
            <button type="button" className="settings-button ghost" onClick={() => void runSetup()}>Re-run setup</button>
          </div>
        ) : (
          <div className="vp-setup-row">
            <div className="settings-card-copy">
              <div className="settings-row-title">One-step setup</div>
              <div className="settings-row-desc">Download whisper-cli and a speech model into Helm's data directory.</div>
            </div>
            <button type="button" className="settings-button primary" onClick={() => void runSetup()}>Set up voice input</button>
          </div>
        )}
        {!setupRunning && setupError && <div className="vp-setup-error" role="alert"><Icon name="ic-alert" size="xs" />{setupError}</div>}
      </div>

      <div className="vp-toolbar settings-card">
        <div className="settings-card-copy">
          <div className="settings-row-title">Floating voice control</div>
          <div className="settings-row-desc">Open a compact always-on-top recorder for dictating into other apps.</div>
        </div>
        <button type="button" className="settings-button ghost" onClick={() => void openPopout()}><Icon name="ic-external" size="xs" />Pop out</button>
      </div>
      {popoutError && <div className="vp-inline-error" role="alert"><Icon name="ic-alert" size="xs" />{popoutError}</div>}

      <div className="vp-adv">
        <button type="button" className="vp-adv-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>
          <Icon name="ic-chev" size="xs" className="vp-adv-chev icon" />
          <span className="vp-adv-name">Advanced</span>
          <span className="vp-adv-hint">binary, model file, download directory</span>
        </button>
        {advancedOpen && (
          <div className="settings-card vp-paths">
            <div className="vp-field">
              <label>Whisper binary <PathState exists={binExists} /></label>
              <input className="mh-input mono" value={binaryPath} spellCheck={false} onChange={(event) => setBinaryPath(event.target.value)} placeholder="whisper-cli" aria-label="Whisper binary path" />
            </div>
            <div className="vp-field">
              <label>Model file <PathState exists={modelExists} /></label>
              <input className="mh-input mono" value={modelPath} spellCheck={false} onChange={(event) => setModelPath(event.target.value)} placeholder="/path/to/ggml-base.bin" aria-label="Model file path" />
            </div>
            <div className="vp-field">
              <label>Model download directory</label>
              <input className="mh-input mono" value={modelDir} spellCheck={false} onChange={(event) => setModelDir(event.target.value)} placeholder="~/.helm/whisper" aria-label="Model directory" />
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
              <button type="button" className="settings-button ghost" onClick={() => void downloadModel(model.id)} disabled={Boolean(downloading)}>
                <Icon name="ic-external" size="xs" />{active && downloading ? "Downloading" : "Download"}
              </button>
            </div>
          );
        })}
        {download && (
          <div className="vp-download">
            {download.error ? <div className="vp-path-bad"><Icon name="ic-alert" size="xs" />{download.error}</div>
              : download.done ? <div className="vp-path-ok"><Icon name="ic-check" size="xs" />{download.modelId} ready</div>
                : <><div className="vp-progress"><span style={{ width: `${downloadPct ?? 30}%` }} data-indeterminate={downloadPct === null || undefined} /></div><span className="vp-progress-label">{downloadPct !== null ? `${downloadPct}%` : `${Math.round(download.received / 1_000_000)} MB`}</span></>}
          </div>
        )}
      </div>

      <div className="vp-caps">Input device</div>
      <div className="settings-card vp-device">
        <div className="vp-field vp-device-field">
          <Dropdown
            value={deviceId ?? ""}
            options={deviceOptions}
            onChange={(value) => setDeviceId(value || null)}
            ariaLabel="Microphone"
            className="vp-wide-dropdown"
            popoverClassName="vp-dd-pop"
            popoverMinWidth={320}
          />
          <button type="button" className="settings-button ghost" onClick={() => void loadDevices()} disabled={devicesLoading}>
            {devicesLoading ? "Detecting" : "Detect microphones"}
          </button>
        </div>
        {deviceError ? <p className="vp-inline-error" role="alert"><Icon name="ic-alert" size="xs" />{deviceError}</p>
          : devices.length === 0 && !devicesLoading ? <p className="vp-hint">No named microphones found. System default remains available.</p>
            : <p className="vp-hint">Selection is saved. Device labels refresh after microphone permission is granted.</p>}
      </div>

      <div className="vp-caps">Prompt improvement</div>
      <div className="settings-card settings-row-card vp-improve">
        <div className="settings-card-copy">
          <div className="settings-row-title">Improve transcript with an LLM</div>
          <div className="settings-row-desc">Falls back to the raw transcript if the model is unavailable.</div>
        </div>
        <Toggle checked={improve} onChange={(enabled) => setRawMode(!enabled)} label="Improve transcript with an LLM" />
      </div>

      {improve && (
        <div className="vp-improve-grid">
          <div className="settings-card vp-mode-card">
            <div className="settings-row-title">Improvement mode</div>
            <div className="vp-segments" role="group" aria-label="Improvement mode">
              <button type="button" aria-pressed={improveMode === "regular"} onClick={() => setImproveMode("regular")}>Regular</button>
              <button type="button" aria-pressed={improveMode === "prompt"} onClick={() => setImproveMode("prompt")}>Prompt</button>
            </div>
            <p className="vp-mode-description">{improveMode === "regular" ? "Cleans up what you said." : "Restructures it into a full prompt for the agent."}</p>
          </div>

          <div className="settings-card vp-effort-card">
            <div className="settings-row-title">Improver effort</div>
            <div className="vp-effort" style={{ "--effort-fill": `${effortIndex * 50}%` } as CSSProperties}>
              <div className="vp-effort-track" aria-hidden="true"><span /><i /><i /><i /></div>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={effortIndex}
                aria-label="Improver effort"
                aria-valuetext={improverEffort}
                onChange={(event) => setImproverEffort(EFFORTS[Number(event.target.value)])}
              />
              <div className="vp-effort-labels"><span>fast</span><strong>{improverEffort}</strong><span>deep</span></div>
            </div>
          </div>

          <div className="settings-card vp-model-picker">
            <div className="settings-card-copy">
              <div className="settings-row-title">Improver model</div>
              <div className="settings-row-desc">{models.length === 0 ? "Probe the proxy under Models to load chat engines." : "Pinned only for voice improvement."}</div>
            </div>
            <Dropdown
              className="mono vp-wide-dropdown"
              value={improverModel}
              options={modelOptions}
              placeholder="Select model"
              onChange={(value) => setSeat("voice-improver", value)}
              disabled={models.length === 0}
              ariaLabel="Improver model"
              popoverClassName="vp-dd-pop"
              popoverMinWidth={360}
            />
          </div>
        </div>
      )}

      <div className="vp-caps">Voice shortcuts</div>
      <div className="settings-card vp-shortcuts">
        <div className="vp-shortcut-row">
          <span><strong>Toggle recording</strong><small>Press once to start, then again to send.</small></span>
          <ShortcutRecorder id="voice.toggle" value={toggleShortcut} onChange={setToggleShortcut} ariaLabel="Record voice toggle shortcut" />
        </div>
        <div className="vp-shortcut-row">
          <span><strong>Hold to talk</strong><small>Release to send. Double-tap the hold key to lock recording on.</small></span>
          <ShortcutRecorder id="voice.hold" value={holdShortcut} onChange={setHoldShortcut} ariaLabel="Record hold to talk shortcut" />
        </div>
      </div>

      <div className="vp-caps">Test recording</div>
      <div className="settings-card vp-test">
        <div className="vp-test-head">
          <VoiceButton onText={setTestResult} />
          <div className="vp-test-copy">
            <strong>Record a test</strong>
            <small>{phase === "error" && error ? error : "Transcribes and improves without inserting text into a pane."}</small>
          </div>
        </div>
        {testResult ? (
          <div className="vp-test-out">
            <div className="vp-test-col">
              <div className="vp-caps">Raw transcript</div>
              <p className="vp-test-text mono">{testResult.rawTranscript || "No transcript"}</p>
            </div>
            <div className="vp-test-col">
              <div className="vp-caps">{testResult.improved ? "Improved" : "Result"}</div>
              <p className="vp-test-text">{testResult.text || "No result"}</p>
              {!testResult.improved && !rawMode && <span className="vp-test-flag">Improvement unavailable. Using raw transcript.</span>}
            </div>
          </div>
        ) : <p className="vp-test-empty">Your latest test transcript appears here.</p>}
      </div>
    </div>
  );
}
