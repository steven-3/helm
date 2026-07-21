/* ══════════════════════════════════════════════════════════════════════════
   ModelHubPanel — CLIProxyAPI wiring UI (OVERHAUL-V4 §3.4 / useModelHub).

   Probe a running proxy for its model list, map each fleet seat to a model,
   preview the generated seat launcher (env pins + base command) and test-spawn
   it into a fresh pane (the same dispatch primitive the board/fleet use). Seat
   dots carry the §4.4 identity hue so the map reads by color.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from "react";
import { useModelHub, agentKindForModel } from "../store/modelhub";
import { usePanes } from "../store/panes";
import { clipboardWrite } from "../lib/commands";
import { Icon } from "./icons";
import { Dropdown } from "./ui/Dropdown";

/** Fleet seat → §4.4 seat-color identity, so the map reads by hue at a glance. */
const SEAT_COLOR: Record<string, string> = {
  orchestrator: "claude",
  "ui-builder": "kimi",
  "backend-worker": "sonnet",
  debugger: "gpt",
  "impl-worker": "custom-1",
  scout: "custom-3",
  "voice-improver": "custom-2",
};

const STATUS_COPY: Record<string, string> = {
  unknown: "Not checked",
  probing: "Probing…",
  online: "Online",
  offline: "Unreachable",
  auth: "Auth required",
};

function activePaneCwd(): string | undefined {
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  return tab ? state.panes[tab.activePaneId]?.cwd : undefined;
}

export function ModelHubPanel() {
  const proxyUrl = useModelHub((s) => s.proxyUrl);
  const authToken = useModelHub((s) => s.authToken);
  const baseCommand = useModelHub((s) => s.baseCommand);
  const seats = useModelHub((s) => s.seats);
  const models = useModelHub((s) => s.models);
  const status = useModelHub((s) => s.status);
  const error = useModelHub((s) => s.error);
  const lastProbeTs = useModelHub((s) => s.lastProbeTs);

  const setProxyUrl = useModelHub((s) => s.setProxyUrl);
  const setAuthToken = useModelHub((s) => s.setAuthToken);
  const setBaseCommand = useModelHub((s) => s.setBaseCommand);
  const setSeat = useModelHub((s) => s.setSeat);
  const removeSeat = useModelHub((s) => s.removeSeat);
  const addSeat = useModelHub((s) => s.addSeat);
  const probe = useModelHub((s) => s.probe);
  const launcherFor = useModelHub((s) => s.launcherFor);

  const seatNames = useMemo(() => Object.keys(seats), [seats]);
  const [previewSeat, setPreviewSeat] = useState<string>(seatNames[0] ?? "orchestrator");
  const [newSeat, setNewSeat] = useState("");
  const [copied, setCopied] = useState(false);

  const activeSeat = seats[previewSeat] !== undefined ? previewSeat : seatNames[0] ?? "orchestrator";
  const launcher = launcherFor(activeSeat);

  // Options = probed models ∪ any currently-pinned model (so pins always render).
  const modelOptions = (pinned: string) => {
    const set = new Set(models);
    if (pinned) set.add(pinned);
    return [...set];
  };

  const copyLauncher = async () => {
    try {
      await clipboardWrite(launcher.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const testSpawn = () => {
    usePanes.getState().addTab({
      agent: agentKindForModel(launcher.model),
      command: launcher.command,
      launchViaShell: true,
      cwd: activePaneCwd(),
      title: `${launcher.seat} · test`,
      tabTitle: `${launcher.seat} test`,
    });
  };

  const submitNewSeat = () => {
    const name = newSeat.trim();
    if (!name) return;
    addSeat(name);
    setNewSeat("");
    setPreviewSeat(name);
  };

  return (
    <div className="mh">
      <div className="settings-card mh-conn">
        <div className="mh-conn-head">
          <div>
            <div className="settings-row-title">CLIProxyAPI endpoint</div>
            <div className="settings-row-desc">Helm reaches the proxy through the Rust loopback bridge; the webview can’t call 127.0.0.1 directly.</div>
          </div>
          <span className="mh-lamp" data-status={status} role="status">
            <i />
            {STATUS_COPY[status] ?? status}
          </span>
        </div>

        <div className="mh-field">
          <label>Proxy URL</label>
          <input className="mh-input mono" value={proxyUrl} spellCheck={false} onChange={(e) => setProxyUrl(e.target.value)} placeholder="http://127.0.0.1:8317" aria-label="Proxy URL" />
        </div>
        <div className="mh-field-row">
          <div className="mh-field">
            <label>Auth token <span className="mh-opt">optional</span></label>
            <input className="mh-input mono" value={authToken} spellCheck={false} onChange={(e) => setAuthToken(e.target.value)} placeholder="bearer token" aria-label="Auth token" />
          </div>
          <div className="mh-field">
            <label>Base command</label>
            <input className="mh-input mono" value={baseCommand} spellCheck={false} onChange={(e) => setBaseCommand(e.target.value)} placeholder="claude" aria-label="Base command" />
          </div>
        </div>

        <div className="mh-conn-foot">
          <button type="button" className="settings-button primary" onClick={() => void probe()} disabled={status === "probing"}>
            {status === "probing" ? "Probing…" : "Probe models"}
          </button>
          <span className="mh-foot-note">
            {status === "auth" ? "Proxy reachable — paste its API key into Auth token (api-keys in the proxy config)"
              : status === "offline" && error ? error
              : models.length > 0 ? `${models.length} model${models.length === 1 ? "" : "s"} available`
              : lastProbeTs ? "No models reported" : "Not yet probed"}
          </span>
        </div>
      </div>

      <div className="mh-caps">Seat → model</div>
      <div className="settings-card mh-seats">
        {seatNames.map((seat) => {
          const pinned = seats[seat];
          return (
            <div className="mh-seat-row" key={seat}>
              <span className="mh-seat-id">
                <span className="seat-dot" data-seat={SEAT_COLOR[seat] ?? undefined} />
                <span className="mh-seat-name">{seat}</span>
              </span>
              <Dropdown
                className="mono"
                value={pinned}
                options={[
                  { value: "", label: "Unpinned" },
                  ...modelOptions(pinned).map((model) => ({ value: model, label: model })),
                ]}
                onChange={(v) => setSeat(seat, v)}
                ariaLabel={`Model for ${seat}`}
              />
              <button type="button" className="mh-seat-remove" aria-label={`Remove ${seat} seat`} onClick={() => removeSeat(seat)} disabled={seatNames.length <= 1}>
                <Icon name="ic-close" size="xs" />
              </button>
            </div>
          );
        })}
        <div className="mh-seat-add">
          <input
            className="mh-input"
            value={newSeat}
            placeholder="Add a seat (e.g. reviewer)"
            onChange={(e) => setNewSeat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNewSeat(); } }}
            aria-label="New seat name"
          />
          <button type="button" className="settings-button ghost" onClick={submitNewSeat} disabled={!newSeat.trim()}>
            <Icon name="ic-plus" size="xs" />Add
          </button>
        </div>
      </div>

      <div className="mh-caps">Launcher preview</div>
      <div className="settings-card mh-launcher">
        <div className="mh-launcher-head">
          <Dropdown
            value={activeSeat}
            options={seatNames.map((seat) => ({ value: seat, label: seat }))}
            onChange={setPreviewSeat}
            ariaLabel="Preview seat"
          />
          <div className="mh-launcher-actions">
            <button type="button" className="settings-button ghost" onClick={copyLauncher}>
              <Icon name={copied ? "ic-check" : "ic-copy"} size="xs" />{copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="settings-button" onClick={testSpawn}>
              <Icon name="ic-play" size="xs" />Test in new pane
            </button>
          </div>
        </div>
        <pre className="mh-launcher-cmd"><code>{launcher.command}</code></pre>
        <div className="mh-launcher-meta">
          {launcher.model
            ? <>Pane identity: <span className="seat-dot" data-seat={SEAT_COLOR[activeSeat] ?? undefined} /> <b>{agentKindForModel(launcher.model)}</b> · model <code>{launcher.model}</code></>
            : <>Unpinned — the launcher omits <code>ANTHROPIC_MODEL</code> and the proxy chooses.</>}
        </div>
      </div>
    </div>
  );
}
