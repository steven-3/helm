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
import { applyTheme } from "./lib/theme";
import { applyMountedTerminalTheme } from "./lib/terminal-session";
import { useSettings } from "./store/settings";

// Apply the persisted token map before React paints. Theme changes then update
// both the document attribute and every mounted xterm canvas in one pass.
applyTheme(useSettings.getState().theme);
useSettings.subscribe((state, previousState) => {
  if (state.theme === previousState.theme) return;
  applyMountedTerminalTheme(applyTheme(state.theme));
});

// No <StrictMode>: its dev-only double-invoke of effects races the native PTY
// spawn (a once-only external resource keyed by paneId) — Rust would reject the
// duplicate. Dropping it is standard for terminal apps; the render stays correct.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
