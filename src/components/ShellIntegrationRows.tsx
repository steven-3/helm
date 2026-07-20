/* ══════════════════════════════════════════════════════════════════════════
   ShellIntegrationRows — per-shell rc-file rows with the preview-then-write
   flow, shared by onboarding step 3 (Command blocks) and Settings → Shell
   Integration. Rows come from shell_integration_status: Windows-side rc files
   plus one row per WSL distro (its own ~/.bashrc, reached through wsl.exe).

   The wizard variant honors the step-2 pick: the default profile's shell
   leads with a "Your default shell" badge and every other shell is tucked
   into a collapsed "Other shells" disclosure (CMD — which has no rc
   integration — gets a quiet note instead). The settings variant is the flat
   list. Styles: .obi-* in styles/onboarding.css.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  rcStatusKey,
  rcStatusLabel,
  shellIntegrationInstall,
  shellIntegrationPreview,
  shellIntegrationStatus,
  type RcStatus,
} from "../lib/ipc";
import { useSettings, wslDistroOf } from "../store/settings";
import { Icon } from "./icons";
import "../styles/onboarding.css";

interface Preview {
  key: string;
  rcPath: string;
  block: string;
}

/** Mirror of shells.rs `slug` so a `detected-wsl-<slug>` profile and an
    RcStatus distro name compare stably. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Which row (by rcStatusKey) the default profile's command lands on, or
    `cmd: true` when the pick is Command Prompt (no rc integration exists). */
function pickedTarget(rows: RcStatus[], command: string | null): { key: string | null; cmd: boolean } {
  if (!command) return { key: null, cmd: false };
  const trimmed = command.trim();

  const distro = wslDistroOf(trimmed);
  if (distro !== null) {
    const wslRows = rows.filter((row) => row.shell === "wsl");
    // Bare `wsl.exe` runs the default distro — wsl -l lists that one first.
    const match = distro
      ? wslRows.find((row) => slug(row.distro ?? "") === slug(distro))
      : wslRows[0];
    return { key: match ? rcStatusKey(match) : null, cmd: false };
  }

  const lower = trimmed.toLowerCase();
  const pick = (shell: RcStatus["shell"]) => {
    const row = rows.find((candidate) => candidate.shell === shell);
    return { key: row ? rcStatusKey(row) : null, cmd: false };
  };
  if (/(powershell|pwsh)(\.exe)?["']?/.test(lower)) return pick("powershell");
  if (/zsh(\.exe)?["']?$/.test(lower)) return pick("zsh");
  if (/bash(\.exe)?["']?$/.test(lower)) return pick("bash");
  if (/(^|[\\/\s"'])cmd(\.exe)?["']?$/.test(lower)) return { key: null, cmd: true };
  return { key: null, cmd: false };
}

export function ShellIntegrationRows({ variant }: { variant: "wizard" | "settings" }) {
  const [rows, setRows] = useState<RcStatus[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [othersOpen, setOthersOpen] = useState(false);

  const defaultProfileId = useSettings((s) => s.defaultProfileId);
  const profiles = useSettings((s) => s.profiles);

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

  const picked = useMemo(() => {
    const profile = defaultProfileId
      ? profiles.find((candidate) => candidate.id === defaultProfileId)
      : undefined;
    return pickedTarget(rows ?? [], profile ? profile.command : null);
  }, [rows, defaultProfileId, profiles]);

  const showPreview = (row: RcStatus) => {
    const key = rcStatusKey(row);
    setBusyKey(key);
    setRowErrors((errors) => ({ ...errors, [key]: "" }));
    shellIntegrationPreview(row.shell, row.distro)
      .then((result) => setPreview({ key, rcPath: result.rcPath, block: result.block }))
      .catch((err) => setRowErrors((errors) => ({ ...errors, [key]: String(err) })))
      .finally(() => setBusyKey(null));
  };

  const confirmInstall = (row: RcStatus) => {
    const key = rcStatusKey(row);
    setInstalling(true);
    setRowErrors((errors) => ({ ...errors, [key]: "" }));
    shellIntegrationInstall(row.shell, row.distro)
      .then(() => {
        setPreview(null);
        setRows((current) =>
          current
            ? current.map((candidate) =>
                rcStatusKey(candidate) === key
                  ? { ...candidate, installed: true, exists: true }
                  : candidate,
              )
            : current,
        );
      })
      .catch((err) => setRowErrors((errors) => ({ ...errors, [key]: String(err) })))
      .finally(() => setInstalling(false));
  };

  const renderRow = (row: RcStatus, isDefault: boolean) => {
    const key = rcStatusKey(row);
    const rowError = rowErrors[key];
    return (
      <li className="obi-row" key={key}>
        <div className="obi-row-main">
          <span className="obi-shell">{rcStatusLabel(row)}</span>
          {isDefault && (
            <span className="obi-badge">
              <Icon name="ic-check" size="xs" />
              Your default shell
            </span>
          )}
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
              disabled={busyKey !== null || installing}
              onClick={() => (preview?.key === key ? setPreview(null) : showPreview(row))}
            >
              {busyKey === key ? "Loading…" : preview?.key === key ? "Hide" : "Add"}
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

        {preview && preview.key === key && (
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
                onClick={() => confirmInstall(row)}
              >
                {installing ? "Adding…" : "Add to profile"}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  if (rows === null) {
    return (
      <div className="ob-loading" role="status">
        <span className="voice-spinner" aria-hidden="true" />
        Reading your shell profiles…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="settings-note ob-err" role="alert">
        <Icon name="ic-alert" size="sm" />
        Couldn’t read shell profile status — {loadError}.
        {variant === "wizard" && " You can set this up later in Settings → Shell Integration."}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="ob-empty">
        <div className="ob-empty-row">
          <Icon name="ic-info" size="sm" />
          <div>
            <p className="ob-empty-title">No supported shell profiles found</p>
            <p className="ob-empty-desc">
              Helm still marks blocks by prompt heuristic. If you add bash, zsh, PowerShell,
              or a WSL distro later, install the snippet
              {variant === "wizard" ? " from Settings → Shell Integration." : " from here."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // The wizard honors the step-2 pick: picked shell prominent, the rest
  // collapsed. Settings (and an unmatched pick) show the flat list.
  const collapse = variant === "wizard" && (picked.key !== null || picked.cmd);
  const primary = collapse && picked.key !== null
    ? rows.filter((row) => rcStatusKey(row) === picked.key)
    : [];
  const others = collapse
    ? rows.filter((row) => rcStatusKey(row) !== picked.key)
    : rows;

  return (
    <div>
      {picked.cmd && variant === "wizard" && (
        <div className="settings-note info" role="note">
          <Icon name="ic-info" size="sm" />
          Command Prompt has no shell integration — Helm falls back to heuristic block
          detection in CMD panes. Other shells can still be set up below.
        </div>
      )}

      {primary.length > 0 && (
        <ul className="ob-list obi-list">
          {primary.map((row) => renderRow(row, true))}
        </ul>
      )}

      {collapse && others.length > 0 ? (
        <div className="obi-others">
          <button
            type="button"
            className="obi-others-toggle"
            aria-expanded={othersOpen}
            onClick={() => setOthersOpen((open) => !open)}
          >
            <Icon name="ic-caret" size="xs" />
            Other shells ({others.length})
          </button>
          {othersOpen && (
            <ul className="ob-list obi-list">
              {others.map((row) => renderRow(row, false))}
            </ul>
          )}
        </div>
      ) : (
        !collapse && (
          <ul className="ob-list obi-list">
            {rows.map((row) => renderRow(row, rcStatusKey(row) === picked.key))}
          </ul>
        )
      )}

      <p className="ob-hint">
        New terminals pick it up on their next prompt. Safe to install more than once.
      </p>
    </div>
  );
}
