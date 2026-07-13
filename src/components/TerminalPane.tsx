/* ══════════════════════════════════════════════════════════════════════════
   TerminalPane — the xterm host. PURELY VISUAL + reusable: instantiates a
   Terminal with the §5 helm theme + font, loads Fit + WebLinks + WebGL (WebGL
   wrapped in try/catch → silent DOM fallback), fits on mount + ResizeObserver,
   and by default writes the mockup's demo ANSI so panes look alive. It does NOT
   spawn a PTY — byte-wiring is Phase-3 (the integrator) via the onReady seam:

       onReady?(paneId: string, term: Terminal, fit: FitAddon): void

   Phase-3 usage: in onReady, `term.clear()` to drop the demo, `term.onData(d =>
   handle.write(d))` for keystrokes, `term.write(bytes)` for PTY output, and call
   `fit.fit()` after container resizes (feed cols/rows to pty_resize).

   Font: 14px full-width; 13px when the pane is narrow (≲560px) — never below 13
   (§10). Cursor does NOT blink — the running-agent pulse is the only ambient
   motion (§8).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { helmTerminalTheme, helmTerminalFont } from "../lib/terminal-theme";
import { openerOpen } from "../lib/commands";
import type { AgentKind } from "../lib/contract";

export interface TerminalPaneProps {
  paneId: string;
  agent: AgentKind;
  focused?: boolean;
  /** Write the mockup's demo ANSI content (default true). Phase-3 passes false or clears. */
  demo?: boolean;
  /** Called once after open + first fit. The Phase-3 PTY-wiring seam. */
  onReady?: (paneId: string, term: Terminal, fit: FitAddon) => void;
}

const COMPACT_WIDTH = 560;
const E = "\x1b[";
const R = `${E}0m`;
const paint = {
  blue: (s: string) => `${E}34m${s}${R}`,
  cyan: (s: string) => `${E}36m${s}${R}`,
  green: (s: string) => `${E}32m${s}${R}`,
  red: (s: string) => `${E}31m${s}${R}`,
  white: (s: string) => `${E}37m${s}${R}`,
  yellow: (s: string) => `${E}33m${s}${R}`,
  bgreen: (s: string) => `${E}92m${s}${R}`,
  bcyan: (s: string) => `${E}96m${s}${R}`,
  byellow: (s: string) => `${E}93m${s}${R}`,
  // terminal-muted #7e848c via truecolor (not in the ANSI 16 — helm chrome tone, §5)
  mut: (s: string) => `${E}38;2;126;132;140m${s}${R}`,
};

/** Per-agent demo scrollback, ported from mockup/cockpit.html's .term content. */
function demoLines(agent: AgentKind): string[] {
  if (agent === "claude") {
    return [
      paint.blue("~/dev/helm") + "  " + paint.cyan("git:(main)"),
      paint.mut("$") + " claude",
      "",
      paint.white("I'll stream PTY stdout into the Tauri Channel and"),
      paint.white("handle resize through invoke()."),
      "",
      paint.green("●") + " Read  " + paint.blue("src-tauri/src/pty.rs") + " " + paint.mut("142 lines"),
      paint.green("●") + " Edit  " + paint.blue("src-tauri/src/pty.rs") + "  " + paint.green("+38") + " " + paint.red("-12"),
      paint.green("●") + " Bash  cargo check",
      "    " + paint.green("Compiling") + " " + paint.mut("helm v0.1.0 (src-tauri)"),
      "     " + paint.green("Finished") + " " + paint.mut("`dev` in 4.21s"),
      paint.green("●") + " Wrote " + paint.white("Channel<Bytes>") + " stream; resize OK.",
      "",
      paint.byellow("◐") + " Running " + paint.white("pty::wsl_launch") + " tests… " + paint.mut("(2/7)"),
      paint.mut("$") + " ",
    ];
  }
  if (agent === "codex") {
    return [
      paint.blue("~/dev/helm") + "  " + paint.cyan("git:(main)"),
      paint.mut("$") + " git status -s",
      " " + paint.byellow("M") + " src-tauri/src/pty.rs",
      " " + paint.byellow("M") + " src/components/Stage.tsx",
      paint.red("??") + " mockup/cockpit.html",
      "",
      paint.mut("$") + " cargo build --release",
      "   " + paint.green("Compiling") + " " + paint.mut("helm v0.1.0"),
      "    " + paint.green("Finished") + " " + paint.mut("`release` in 38.7s"),
      "    " + paint.green("test result: ok.") + " " + paint.mut("24 passed; 0 failed"),
      "",
      paint.mut("$") + ' codex "gen TS types from PtyEvent"',
      paint.bcyan("▌") + " writing " + paint.blue("src/types/pty.ts") + " …",
      "  " + paint.green("+") + " export interface PtyEvent {",
      "  " + paint.green("+") + "   id: string; bytes: Uint8Array",
      "  " + paint.green("+") + " }",
    ];
  }
  // generic shell
  return [
    paint.blue("~/dev/helm") + "  " + paint.cyan("git:(main)"),
    paint.mut("$") + " ls -la",
    paint.blue("drwxr-xr-x") + "  src  src-tauri  docs  mockup",
    paint.mut("-rw-r--r--") + "  DESIGN.md  package.json  tsconfig.json",
    paint.mut("$") + " ",
  ];
}

export function TerminalPane({ paneId, agent, focused, demo = true, onReady }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      theme: helmTerminalTheme,
      fontFamily: helmTerminalFont.fontFamily,
      fontSize: helmTerminalFont.fontSize,
      lineHeight: helmTerminalFont.lineHeight,
      fontWeight: 400,
      fontWeightBold: 600,
      cursorBlink: false, // running-pulse is the only ambient motion (§8)
      cursorStyle: "block",
      scrollback: 2000,
    });
    termRef.current = term;

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => { void openerOpen(uri); }));
    term.open(host);

    // WebGL renderer — silent fallback to DOM if unavailable (GPU-contended env, §4).
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* fall back to the default renderer */
    }

    const applySize = () => {
      const w = host.clientWidth;
      const fs = w > 0 && w < COMPACT_WIDTH ? helmTerminalFont.fontSizeCompact : helmTerminalFont.fontSize;
      if (term.options.fontSize !== fs) term.options.fontSize = fs;
    };
    applySize();
    try { fit.fit(); } catch { /* host not measured yet */ }

    // Demo scrollback only when nobody will drive this pane. A wired pane (onReady
    // present) starts empty and fills from its PTY — writing demo here would race
    // xterm's async write queue against the live stream and leave stale text behind.
    if (demo && !onReadyRef.current) term.write(demoLines(agent).join("\r\n"));

    onReadyRef.current?.(paneId, term, fit);

    const ro = new ResizeObserver(() => {
      applySize();
      try { fit.fit(); } catch { /* transient 0-size */ }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [paneId, agent, demo]);

  // focus → solid cursor (and preps Phase-3 keystroke routing); not an effect reset.
  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  return <div className="term-host" ref={hostRef} />;
}
