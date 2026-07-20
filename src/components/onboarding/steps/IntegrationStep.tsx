/* ══════════════════════════════════════════════════════════════════════════
   Step 3 · Shell integration (command blocks) — one line in the shell profile
   lets Helm mark every command with ✓/✗ blocks (OSC 133). Per-shell rows show
   installed state; "Add" ALWAYS previews the exact block + rc path in a
   diff-styled well and waits for an explicit Confirm before anything is
   written. Installed shells render read-only.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from "react";
import {
  shellIntegrationInstall,
  shellIntegrationPreview,
  shellIntegrationStatus,
  type RcStatus,
} from "../../../lib/ipc";
import { Icon } from "../../icons";
import { StepHeader } from "../shared";

interface Preview {
  shell: RcStatus["shell"];
  rcPath: string;
  block: string;
}

function shellLabel(id: string): string {
  const lower = id.toLowerCase();
  if (lower === "powershell" || lower === "pwsh") return "PowerShell";
  return id;
}

export function IntegrationStep() {
  const [rows, setRows] = useState<RcStatus[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busyShell, setBusyShell] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoadError(null);
    shellIntegrationStatus()
      .then((status) => setRows(status))
      .catch((err) => {
        setRows([]);
        setLoadError(String(err));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showPreview = (shell: RcStatus["shell"]) => {
    setBusyShell(shell);
    setRowErrors((errors) => ({ ...errors, [shell]: "" }));
    shellIntegrationPreview(shell)
      .then((result) => setPreview({ shell, rcPath: result.rcPath, block: result.block }))
      .catch((err) => setRowErrors((errors) => ({ ...errors, [shell]: String(err) })))
      .finally(() => setBusyShell(null));
  };

  const confirmInstall = () => {
    if (!preview) return;
    const shell = preview.shell;
    setInstalling(true);
    setRowErrors((errors) => ({ ...errors, [shell]: "" }));
    shellIntegrationInstall(shell)
      .then(() => {
        setPreview(null);
        setRows((current) =>
          current
            ? current.map((row) =>
                row.shell === shell ? { ...row, installed: true, exists: true } : row,
              )
            : current,
        );
      })
      .catch((err) => setRowErrors((errors) => ({ ...errors, [shell]: String(err) })))
      .finally(() => setInstalling(false));
  };

  return (
    <div>
      <StepHeader kicker="Step 3 of 6 · Command blocks" title="Mark every command ✓ / ✗">
        Helm marks each command with ✓/✗ blocks — needs one line in your shell profile.
        You always see the exact change before anything is written.
      </StepHeader>

      {rows === null && (
        <div className="ob-loading" role="status">
          <span className="voice-spinner" aria-hidden="true" />
          Reading your shell profiles…
        </div>
      )}

      {rows !== null && loadError && (
        <div className="settings-note ob-err" role="alert">
          <Icon name="ic-alert" size="sm" />
          Couldn’t read shell profile status — {loadError}. You can set this up later in
          Settings → Shell Integration.
        </div>
      )}

      {rows !== null && !loadError && rows.length === 0 && (
        <div className="ob-empty">
          <div className="ob-empty-row">
            <Icon name="ic-info" size="sm" />
            <div>
              <p className="ob-empty-title">No supported shell profiles found</p>
              <p className="ob-empty-desc">
                Helm still marks blocks by prompt heuristic. If you add bash, zsh, or
                PowerShell later, install the snippet from Settings → Shell Integration.
              </p>
            </div>
          </div>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="ob-list obi-list">
          {rows.map((row) => {
            const rowError = rowErrors[row.shell];
            return (
              <li className="obi-row" key={row.shell}>
                <div className="obi-row-main">
                  <span className="obi-shell">{shellLabel(row.shell)}</span>
                  <span className="obi-path" title={row.rcPath}>{row.rcPath}</span>
                  {row.installed ? (
                    <span className="obi-state ok">
                      <Icon name="ic-check" size="xs" />
                      Installed
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="settings-button"
                      disabled={busyShell !== null || installing}
                      onClick={() =>
                        preview?.shell === row.shell ? setPreview(null) : showPreview(row.shell)
                      }
                    >
                      {busyShell === row.shell ? "Loading…" : preview?.shell === row.shell ? "Hide" : "Add"}
                    </button>
                  )}
                </div>

                {!row.installed && !row.exists && (
                  <p className="obi-note">Creates {row.rcPath} — the file doesn’t exist yet.</p>
                )}

                {rowError && (
                  <div className="ob-error" role="alert">
                    <Icon name="ic-alert" size="xs" />
                    {rowError}
                  </div>
                )}

                {preview && preview.shell === row.shell && (
                  <div className="obi-preview">
                    <span className="ob-caps">Helm adds this to {preview.rcPath}</span>
                    <div className="obi-diff" aria-label="Lines to add">
                      {preview.block.split("\n").map((line, index) => (
                        <div className="obi-diff-line" key={index}>
                          <span className="obi-diff-mark" aria-hidden="true">+</span>
                          <code>{line === "" ? " " : line}</code>
                        </div>
                      ))}
                    </div>
                    <div className="obi-actions">
                      <button
                        type="button"
                        className="settings-button ghost"
                        disabled={installing}
                        onClick={() => setPreview(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="settings-button primary"
                        disabled={installing}
                        onClick={confirmInstall}
                      >
                        {installing ? "Adding…" : "Add to profile"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows !== null && rows.length > 0 && (
        <p className="ob-hint">
          New terminals pick it up on their next prompt. Safe to install more than once.
        </p>
      )}
    </div>
  );
}
