/* ══════════════════════════════════════════════════════════════════════════
   Step 2 · Shells & default profile — probe the machine for installed shells
   (CMD, PowerShell 5/7, Git Bash, each WSL distro), sync them into the
   profile list, and let the operator pick the default for new terminals.
   Detection failures degrade to "keep your current default" — never a wall.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from "react";
import { shellDetect, type DetectedShell } from "../../../lib/ipc";
import { useSettings } from "../../../store/settings";
import { Icon } from "../../icons";
import { StepHeader } from "../shared";

type Probe = "probing" | "ready" | "empty" | "error";

/** Short mono badge per shell kind — text, not a fake icon (kind is data). */
const KIND_BADGE: Record<DetectedShell["kind"], string> = {
  cmd: "CMD",
  powershell: "PS 5",
  pwsh: "PS 7",
  bash: "bash",
  zsh: "zsh",
  fish: "fish",
  wsl: "WSL",
};

export function ShellsStep() {
  const [probe, setProbe] = useState<Probe>("probing");
  const [shells, setShells] = useState<DetectedShell[]>([]);
  const defaultProfileId = useSettings((s) => s.defaultProfileId);
  const setDefaultProfileId = useSettings((s) => s.setDefaultProfileId);

  const detect = useCallback(() => {
    setProbe("probing");
    shellDetect()
      .then((detected) => {
        setShells(detected);
        // Upsert the detected shells as launch profiles (id-keyed, per the
        // settings contract) so the radio pick below maps to a real profile.
        useSettings.getState().syncDetectedProfiles(detected);
        setProbe(detected.length > 0 ? "ready" : "empty");
      })
      .catch(() => setProbe("error"));
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  return (
    <div>
      <StepHeader kicker="Step 2 of 6 · Shells" title="Your shells, wired in">
        Helm found the shells below and added them as launch profiles. Pick the one new
        terminals start with — change it any time in Settings.
      </StepHeader>

      {probe === "probing" && (
        <div className="ob-loading" role="status">
          <span className="voice-spinner" aria-hidden="true" />
          Detecting shells on this system…
        </div>
      )}

      {probe === "ready" && (
        <div className="ob-list" role="radiogroup" aria-label="Default shell for new terminals">
          <label className={`obs-row${defaultProfileId === null ? " selected" : ""}`}>
            <input
              type="radio"
              name="ob-default-shell"
              checked={defaultProfileId === null}
              onChange={() => setDefaultProfileId(null)}
            />
            <span className="obs-kind" aria-hidden="true">OS</span>
            <span className="obs-main">
              <span className="obs-label">System default</span>
              <span className="obs-cmd">The operating system’s own shell</span>
            </span>
          </label>
          {shells.map((shell) => (
            <label className={`obs-row${defaultProfileId === shell.id ? " selected" : ""}`} key={shell.id}>
              <input
                type="radio"
                name="ob-default-shell"
                checked={defaultProfileId === shell.id}
                onChange={() => setDefaultProfileId(shell.id)}
              />
              <span className="obs-kind" aria-hidden="true">{KIND_BADGE[shell.kind]}</span>
              <span className="obs-main">
                <span className="obs-label">{shell.label}</span>
                <span className="obs-cmd">{shell.path ?? shell.command}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {(probe === "empty" || probe === "error") && (
        <div className="ob-empty">
          <div className="ob-empty-row">
            <Icon name={probe === "error" ? "ic-alert" : "ic-info"} size="sm" />
            <div>
              <p className="ob-empty-title">
                {probe === "error" ? "Shell detection didn’t finish" : "No shells detected"}
              </p>
              <p className="ob-empty-desc">
                Helm keeps your current default. You can set up profiles later in
                Settings → Agent profiles.
              </p>
            </div>
          </div>
          {probe === "error" && (
            <div className="ob-empty-actions">
              <button type="button" className="settings-button ghost" onClick={detect}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
