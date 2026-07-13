import ReactDOM from "react-dom/client";

// Fonts — the mono-forward identity is load-bearing (DESIGN.md §6).
// Mono 300/400/500/600 (300 reserved for large display numerals), Sans 400/500/600.
import "@fontsource/ibm-plex-mono/300.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";

// Styles — tokens (single source) → xterm base → helm global base.
import "./styles/tokens.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/global.css";

import App from "./App";

// No <StrictMode>: its dev-only double-invoke of effects races the native PTY
// spawn (a once-only external resource keyed by paneId) — Rust would reject the
// duplicate. Dropping it is standard for terminal apps; the render stays correct.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
