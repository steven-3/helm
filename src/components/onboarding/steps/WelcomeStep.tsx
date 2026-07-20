/* ══════════════════════════════════════════════════════════════════════════
   Step 1 · Welcome + theme — the brand moment. Helm identity up front (mark,
   wordmark, one line of intent), the four-seat color vocabulary as live chips,
   and the theme pick: three featured themes (Void / Light / Abyss) painted
   from their REAL resolved tokens, with the full 12-theme gallery one click
   away. Applying a theme re-themes the document and every mounted terminal
   immediately — the workspace behind the wizard changes as you choose.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { useSettings, applyThemeSelection } from "../../../store/settings";
import { applyMountedTerminalTheme } from "../../../lib/terminal-session";
import { getTheme, resolveThemeTokens, type HelmTheme } from "../../../lib/themes";
import { Icon } from "../../icons";
import { ThemeGallery } from "../../ThemeGallery";

/** One featured dark + the day theme + one distinctive dark, so the trio shows
    the engine's range without turning the welcome step into a catalog. */
const FEATURED_IDS = ["helm-void", "helm-light", "abyss"] as const;

/** The v4 seat vocabulary (DESIGN.md §4.4) — identity is dot + word, the same
    pairing the fleet surfaces use. */
const SEATS: Array<{ seat: string; word: string }> = [
  { seat: "claude", word: "claude" },
  { seat: "gpt", word: "gpt" },
  { seat: "kimi", word: "kimi" },
  { seat: "sonnet", word: "sonnet" },
];

/** Compact theme card — same .tg-* recipe as the full gallery (settings.css),
    painted from the theme's resolved tokens, never an approximation. */
function FeaturedTheme({ theme }: { theme: HelmTheme }) {
  const active = useSettings((s) => s.themeId === theme.id);
  const setThemeId = useSettings((s) => s.setThemeId);
  const t = resolveThemeTokens(theme);
  const border = t["--n-7"] ?? t["--n-9"];
  const dim = t["--n-8"] ?? t["--n-9"];
  const termBg = theme.terminal.background ?? t["--n-1"];
  const termFg = theme.terminal.foreground ?? t["--n-12"];
  const accent = t["--indigo-solid"];
  const accentText = t["--indigo-text"];

  const apply = () => {
    setThemeId(theme.id);
    applyMountedTerminalTheme(applyThemeSelection(theme.id));
  };

  return (
    <div className={`tg-card${active ? " active" : ""}`}>
      <button
        type="button"
        className="tg-card-apply"
        aria-pressed={active}
        aria-label={`Apply ${theme.name} theme`}
        onClick={apply}
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
    </div>
  );
}

export function WelcomeStep() {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const featured = FEATURED_IDS.map((id) => getTheme(id)).filter(
    (theme): theme is HelmTheme => theme !== undefined,
  );

  return (
    <div className="ob-welcome">
      <div className="obw-hero">
        <span className="obw-mark" aria-hidden="true">
          <Icon name="ic-helm" />
        </span>
        <h2 className="obw-title">Welcome to Helm</h2>
        <p className="obw-tag">
          One cockpit for your whole agent fleet — every session, seat, and task in a
          single fast window. Two minutes of setup, then it’s yours.
        </p>
        <div className="obw-seats" aria-label="Agent seat colors">
          {SEATS.map(({ seat, word }) => (
            <span className="seat-chip obw-seat" data-seat={seat} key={seat}>
              <i className="seat-dot" aria-hidden="true" />
              {word}
            </span>
          ))}
        </div>
        <p className="obw-seats-note">A color per seat, so a full fleet reads at a glance.</p>
      </div>

      <div className="obw-theme">
        <div className="obw-theme-head">
          <span className="ob-caps">Pick your look</span>
          <button
            type="button"
            className="settings-button ghost"
            aria-expanded={galleryOpen}
            onClick={() => setGalleryOpen((open) => !open)}
          >
            {galleryOpen ? "Show featured" : "All 12 themes"}
            <Icon name="ic-chev" size="xs" className={galleryOpen ? "icon ob-chev open" : "icon ob-chev"} />
          </button>
        </div>
        <div className="obw-featured">
          {featured.map((theme) => (
            <FeaturedTheme theme={theme} key={theme.id} />
          ))}
        </div>
        {galleryOpen && (
          <div className="obw-gallery">
            <ThemeGallery />
          </div>
        )}
      </div>
    </div>
  );
}
