import ReactDOM from "react-dom/client";

// Fonts (DESIGN.md §6) — Inter chrome, JetBrains Mono for code/data.
//  · Inter        → chrome/UI (default body): labels, roster, tree, tabs, status,
//                   wordmark, dialogs. 300 reserved for large display numerals.
//  · JetBrains Mono → code/data/tabular-numbers/file-paths/IDs (--font-mono)
//                    and the stable default terminal face.
//  · IBM Plex Mono → terminal picker option;
//                    kept for the 400/600/italic weights loadTermFont() probes.
// Terminal faces (Monaspace Neon/Argon) are bundled woff2, declared in fonts.css.
import "@fontsource/inter/latin-300.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400-italic.css";
import "@fontsource/ibm-plex-mono/latin-600.css";

// Styles — tokens (single source) → fonts → xterm base → helm global base.
import "./styles/tokens.css";
import "./styles/fonts.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/global.css";

import App from "./App";
import { applyMountedTerminalTheme } from "./lib/terminal-session";
import { useSettings, applyThemeSelection, initThemeFromSettings } from "./store/settings";
import { startupUpdateCheck } from "./store/updater";

// Apply the persisted THEME ID before React paints (§4.10 theme engine) — this
// resolves registry themes AND user themes the registry can't (bare applyTheme
// only knew dark/light). Theme changes then re-flip the document + re-theme
// every mounted xterm canvas in one pass, keyed off the id (not the legacy mode).
initThemeFromSettings();
useSettings.subscribe((state, previousState) => {
  if (state.themeId === previousState.themeId) return;
  applyMountedTerminalTheme(applyThemeSelection(state.themeId));
});

// §4.1 updater — a silent check shortly after launch; the rail's update-ready
// pill + the Settings > Updates card surface the result. No-op outside Tauri.
startupUpdateCheck();

// No <StrictMode>: its dev-only double-invoke of effects races the native PTY
// spawn (a once-only external resource keyed by paneId) — Rust would reject the
// duplicate. Dropping it is standard for terminal apps; the render stays correct.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
