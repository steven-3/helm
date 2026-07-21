/* ══════════════════════════════════════════════════════════════════════════
   Step 4 · Model Hub — point Helm at a running CLIProxyAPI and probe it. Kept
   deliberately light: URL + Probe + a seat quick-pick summary from the live
   modelhub store, with an escape hatch into the full Model Hub panel (finishes
   the wizard and opens Settings → Models). A failed probe skips cleanly.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { useModelHub } from "../../../store/modelhub";
import type { SettingsSection } from "../../Settings";
import { Icon } from "../../icons";
import { StepHeader } from "../shared";

export function ModelHubStep({
  onOpenSettings,
}: {
  onOpenSettings: (section: SettingsSection) => void;
}) {
  const proxyUrl = useModelHub((s) => s.proxyUrl);
  const status = useModelHub((s) => s.status);
  const models = useModelHub((s) => s.models);
  const seats = useModelHub((s) => s.seats);
  const error = useModelHub((s) => s.error);
  const setProxyUrl = useModelHub((s) => s.setProxyUrl);
  const authToken = useModelHub((s) => s.authToken);
  const setAuthToken = useModelHub((s) => s.setAuthToken);
  const probe = useModelHub((s) => s.probe);

  const [url, setUrl] = useState(proxyUrl);
  const [token, setToken] = useState(authToken);
  const probing = status === "probing";

  const runProbe = () => {
    setProxyUrl(url);
    setAuthToken(token);
    void probe();
  };

  const seatEntries = Object.entries(seats);

  return (
    <div>
      <StepHeader kicker="Step 4 of 6 · Model Hub" title="Route your fleet through one proxy">
        Helm drives every seat through a local CLIProxyAPI. Point it at yours and probe —
        or skip and wire it later.
      </StepHeader>

      <div className="obm-field">
        <input
          className="mh-input mono"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !probing && url.trim()) runProbe();
          }}
          placeholder="http://127.0.0.1:8317"
          aria-label="Proxy URL"
          spellCheck={false}
        />
        <button
          type="button"
          className="settings-button primary"
          disabled={probing || !url.trim()}
          onClick={runProbe}
        >
          {probing ? (
            <>
              <span className="voice-spinner" aria-hidden="true" />
              Probing…
            </>
          ) : (
            "Probe"
          )}
        </button>
      </div>

      {status === "online" && (
        <>
          <div className="settings-note info" role="status">
            <Icon name="ic-check" size="sm" />
            Proxy online — {models.length} {models.length === 1 ? "model" : "models"} available.
            Pin a model to each seat and Helm launches it with the right env.
          </div>
          {seatEntries.length > 0 && (
            <div className="obm-seats" aria-label="Seat model pins">
              {seatEntries.map(([seat, model]) => (
                <span className="obm-seat" key={seat}>
                  <b>{seat}</b>
                  <code>{model || "unpinned"}</code>
                </span>
              ))}
            </div>
          )}
          <div className="obm-more">
            <button
              type="button"
              className="settings-button ghost"
              onClick={() => onOpenSettings("models")}
            >
              Open Model Hub for full mapping
              <Icon name="ic-external" size="xs" />
            </button>
          </div>
        </>
      )}

      {status === "auth" && (
        <div className="obm-field obm-auth">
          <input
            className="mh-input mono"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !probing && token.trim()) runProbe();
            }}
            placeholder="proxy API key (api-keys in its config)"
            aria-label="Proxy auth token"
            spellCheck={false}
          />
          <div className="settings-note ob-warn" role="status">
            <Icon name="ic-alert" size="sm" />
            Proxy answered at {proxyUrl} but wants auth — paste its API key and probe
            again.
          </div>
        </div>
      )}

      {status === "offline" && (
        <div className="settings-note ob-warn" role="status">
          <Icon name="ic-alert" size="sm" />
          No proxy answering at {proxyUrl}
          {error ? ` — ${error}` : ""}. Skip this step; Model Hub lives in Settings when
          you’re ready.
        </div>
      )}

      {status === "unknown" && (
        <p className="ob-hint">
          Runs on your machine by default — the stock CLIProxyAPI port is pre-filled.
        </p>
      )}
    </div>
  );
}
