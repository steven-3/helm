/* ══════════════════════════════════════════════════════════════════════════
   ThemeGallery — the Appearance theme engine UI (OVERHAUL-V4 §4.10, DESIGN.md
   §13.5). A live grid of theme cards (shipped registry + user themes): each is
   a mini mock painted from that theme's ACTUAL resolved tokens — chrome plate,
   terminal well, accent chip. Clicking applies + persists and re-themes every
   mounted terminal. User themes: paste JSON → validateTheme() → save, then
   export (copy) / delete. The current theme carries an indigo ring.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { useSettings, applyThemeSelection } from "../store/settings";
import { applyMountedTerminalTheme } from "../lib/terminal-session";
import { clipboardWrite } from "../lib/commands";
import {
  THEMES,
  resolveThemeTokens,
  validateTheme,
  type HelmTheme,
} from "../lib/themes";
import { Icon } from "./icons";

/** Paint one card's mock from the theme's resolved token map (base ← kind ←
    overrides) + its xterm palette — the real colors, not an approximation. */
function ThemeCard({
  theme,
  active,
  onApply,
  onDelete,
  onExport,
  custom,
}: {
  theme: HelmTheme;
  active: boolean;
  onApply: (theme: HelmTheme) => void;
  onDelete?: (theme: HelmTheme) => void;
  onExport?: (theme: HelmTheme) => void;
  custom?: boolean;
}) {
  const t = resolveThemeTokens(theme);
  // VOID_BASE / LIGHT_KIND mirror only a subset of the ramp, so fall back to a
  // guaranteed step for the mid-grey borders/dots (base themes omit n7/n8).
  const border = t["--n-7"] ?? t["--n-9"];
  const dim = t["--n-8"] ?? t["--n-9"];
  const termBg = theme.terminal.background ?? t["--n-1"];
  const termFg = theme.terminal.foreground ?? t["--n-12"];
  const accent = t["--indigo-solid"];
  const accentText = t["--indigo-text"];

  return (
    <div className={`tg-card${active ? " active" : ""}`}>
      <button
        type="button"
        className="tg-card-apply"
        aria-pressed={active}
        aria-label={`Apply ${theme.name} theme`}
        onClick={() => onApply(theme)}
      >
        <span className="tg-mock" style={{ background: t["--n-1"] }} aria-hidden="true">
          <span className="tg-mock-bar" style={{ background: t["--n-2"], borderColor: border }}>
            <i style={{ background: accent }} />
            <i style={{ background: dim }} />
            <i style={{ background: dim }} />
          </span>
          <span className="tg-mock-body">
            <span className="tg-mock-rail" style={{ background: t["--n-2"], borderColor: border }}>
              <i style={{ background: dim }} />
              <i style={{ background: accent }} />
              <i style={{ background: dim }} />
            </span>
            <span className="tg-mock-well" style={{ background: termBg }}>
              <i style={{ background: termFg, width: "58%" }} />
              <i style={{ background: accentText, width: "38%" }} />
              <i style={{ background: t["--n-9"], width: "70%" }} />
            </span>
          </span>
        </span>
        <span className="tg-card-meta">
          <span className="tg-card-name">{theme.name}</span>
          <span className={`tg-kind ${theme.kind}`}>{theme.kind}</span>
        </span>
      </button>
      {active && (
        <span className="tg-current" aria-label="Current theme">
          <Icon name="ic-check" size="xs" />
        </span>
      )}
      {custom && (
        <span className="tg-card-tools">
          <button type="button" className="tg-tool" aria-label={`Export ${theme.name}`} title="Copy theme JSON" onClick={() => onExport?.(theme)}>
            <Icon name="ic-copy" size="xs" />
          </button>
          <button type="button" className="tg-tool danger" aria-label={`Delete ${theme.name}`} title="Delete theme" onClick={() => onDelete?.(theme)}>
            <Icon name="ic-close" size="xs" />
          </button>
        </span>
      )}
    </div>
  );
}

export function ThemeGallery() {
  const themeId = useSettings((s) => s.themeId);
  const customThemes = useSettings((s) => s.customThemes);
  const setThemeId = useSettings((s) => s.setThemeId);
  const addCustomTheme = useSettings((s) => s.addCustomTheme);
  const removeCustomTheme = useSettings((s) => s.removeCustomTheme);

  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    // Self-heal: main.tsx applies the legacy kind base at boot; re-assert the
    // persisted registry/custom selection when Appearance opens (a no-op once
    // boot wiring calls initThemeFromSettings()).
    applyMountedTerminalTheme(applyThemeSelection(useSettings.getState().themeId));
  }, []);

  const apply = (theme: HelmTheme) => {
    setThemeId(theme.id);
    // Re-theme mounted terminals; the document is switched inside applyThemeSelection.
    applyMountedTerminalTheme(applyThemeSelection(theme.id));
  };

  const importTheme = () => {
    setErrors([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (err) {
      setErrors([`Not valid JSON: ${String(err instanceof Error ? err.message : err)}`]);
      return;
    }
    const result = validateTheme(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    addCustomTheme(result.theme);
    setDraft("");
    setImportOpen(false);
    apply(result.theme);
  };

  const exportTheme = async (theme: HelmTheme) => {
    const json = JSON.stringify(
      { id: theme.id, name: theme.name, kind: theme.kind, tokens: theme.tokens, terminal: theme.terminal, blurb: theme.blurb },
      null,
      2,
    );
    try {
      await clipboardWrite(json);
      setCopied(theme.id);
      window.setTimeout(() => setCopied((id) => (id === theme.id ? null : id)), 1600);
    } catch {
      /* clipboard unavailable in the current context */
    }
  };

  const deleteTheme = (theme: HelmTheme) => {
    removeCustomTheme(theme.id);
    if (themeId === theme.id) {
      // The store retreats themeId to the kind base; mirror it onto the terminals.
      applyMountedTerminalTheme(applyThemeSelection(useSettings.getState().themeId));
    }
  };

  return (
    <div className="tg">
      <div className="tg-grid">
        {THEMES.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} active={theme.id === themeId} onApply={apply} />
        ))}
      </div>

      <div className="tg-user">
        <div className="tg-user-head">
          <div>
            <div className="tg-caps">Your themes</div>
            <p className="tg-user-desc">
              Import a token override map as JSON. Every theme is gated to the app’s AA contrast floor before it can be saved.
            </p>
          </div>
          <button type="button" className="settings-button ghost" onClick={() => setImportOpen((v) => !v)} aria-expanded={importOpen}>
            <Icon name="ic-plus" size="xs" />
            Import
          </button>
        </div>

        {customThemes.length > 0 && (
          <div className="tg-grid">
            {customThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                custom
                active={theme.id === themeId}
                onApply={apply}
                onDelete={deleteTheme}
                onExport={exportTheme}
              />
            ))}
          </div>
        )}

        {copied && <div className="tg-copied"><Icon name="ic-check" size="xs" />Copied theme JSON to the clipboard.</div>}

        {importOpen && (
          <div className="tg-import">
            <textarea
              className="tg-textarea"
              spellCheck={false}
              value={draft}
              placeholder={'{ "id": "my-theme", "name": "My Theme", "kind": "dark", "tokens": { "--n-1": "#0b0d10", "--indigo-solid": "#7c8cff" } }'}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Theme JSON"
            />
            {errors.length > 0 && (
              <ul className="tg-errors">
                {errors.map((error, index) => (
                  <li key={index}><Icon name="ic-alert" size="xs" />{error}</li>
                ))}
              </ul>
            )}
            <div className="tg-import-actions">
              <button type="button" className="settings-button ghost" onClick={() => { setImportOpen(false); setErrors([]); }}>Cancel</button>
              <button type="button" className="settings-button primary" onClick={importTheme} disabled={!draft.trim()}>Validate &amp; save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
