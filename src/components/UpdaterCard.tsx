/* ══════════════════════════════════════════════════════════════════════════
   UpdaterCard — in-app auto-update UI (OVERHAUL-V4 §4.1 / useUpdater).

   Shows the current version, checks the feed, and walks the lifecycle:
   available → notes + download progress → "Restart to update". The auto-check
   toggle drives the silent startup check + the titlebar "update ready" pill.
   ══════════════════════════════════════════════════════════════════════════ */
import { useUpdater } from "../store/updater";
import { useSettings } from "../store/settings";
import { Icon } from "./icons";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}

export function UpdaterCard() {
  const state = useUpdater((s) => s.state);
  const version = useUpdater((s) => s.version);
  const currentVersion = useUpdater((s) => s.currentVersion);
  const notes = useUpdater((s) => s.notes);
  const progress = useUpdater((s) => s.progress);
  const downloadedBytes = useUpdater((s) => s.downloadedBytes);
  const totalBytes = useUpdater((s) => s.totalBytes);
  const error = useUpdater((s) => s.error);
  const check = useUpdater((s) => s.check);
  const download = useUpdater((s) => s.download);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);

  const autoCheckUpdates = useSettings((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useSettings((s) => s.setAutoCheckUpdates);

  const installed = currentVersion ?? __APP_VERSION__;
  const busy = state === "checking" || state === "downloading" || state === "installing";
  const pct = progress !== null ? Math.round(progress * 100) : null;
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);

  return (
    <div className="uc">
      <div className="settings-card uc-head">
        <div className="uc-version">
          <span className="uc-badge"><Icon name="ic-helm" /></span>
          <div>
            <div className="settings-row-title">Helm v{installed}</div>
            <div className="settings-row-desc">
              {state === "idle" && "You’re on the latest checked build."}
              {state === "checking" && "Checking for updates…"}
              {state === "available" && `Version ${version} is available.`}
              {state === "downloading" && `Downloading ${version}…`}
              {state === "ready" && `Version ${version} is ready to install.`}
              {state === "installing" && "Installing — Helm will relaunch."}
              {state === "error" && "The update check ran into a problem."}
            </div>
          </div>
        </div>
        {(state === "idle" || state === "error") && (
          <button type="button" className="settings-button" onClick={() => void check()} disabled={busy}>
            <Icon name="ic-progress" size="xs" />Check now
          </button>
        )}
      </div>

      {state === "error" && error && (
        <div className="settings-note info uc-error">
          <Icon name="ic-alert" size="sm" />
          <span>{error}</span>
        </div>
      )}

      {(state === "available" || state === "downloading" || state === "ready") && (
        <div className="settings-card uc-detail">
          {notes && (
            <div className="uc-notes">
              <div className="vp-caps">Release notes</div>
              <pre className="uc-notes-body">{notes}</pre>
            </div>
          )}

          {state === "downloading" && (
            <div className="uc-progress-wrap">
              <div className="vp-progress"><span style={{ width: `${pct ?? 40}%` }} data-indeterminate={pct === null || undefined} /></div>
              <span className="vp-progress-label">
                {pct !== null ? `${pct}%` : totalBytes ? `${mb(downloadedBytes)} / ${mb(totalBytes)} MB` : `${mb(downloadedBytes)} MB`}
              </span>
            </div>
          )}

          <div className="uc-actions">
            {state === "available" && (
              <>
                <button type="button" className="settings-button ghost" onClick={dismiss}>Later</button>
                <button type="button" className="settings-button primary" onClick={() => void download()}>
                  <Icon name="ic-external" size="xs" />Download update
                </button>
              </>
            )}
            {state === "ready" && (
              <button type="button" className="settings-button primary" onClick={() => void install()}>
                <Icon name="ic-play" size="xs" />Restart to update
              </button>
            )}
          </div>
        </div>
      )}

      <div className="settings-card settings-row-card uc-auto">
        <div className="settings-card-copy">
          <div className="settings-row-title">Check for updates automatically</div>
          <div className="settings-row-desc">A quiet check at startup; a ready update surfaces as a titlebar pill, never an interruption.</div>
        </div>
        <Toggle checked={autoCheckUpdates} onChange={setAutoCheckUpdates} label="Check for updates automatically" />
      </div>
    </div>
  );
}
