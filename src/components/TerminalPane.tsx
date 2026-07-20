import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { TERM_FONTS, loadTermFont } from "../lib/terminal-theme";
import { terminalThemeFor } from "../lib/theme";
import { openerOpen } from "../lib/commands";
import { TerminalSearch } from "./TerminalSearch";
import { BlockGutter } from "./BlockGutter";
import { ScrollPill } from "./ScrollPill";
import { TermContextMenu } from "./TermContextMenu";
import { droppedPaths, quoteDroppedPaths } from "../lib/shell-integration";
import { usePanes } from "../store/panes";
import { useResizing } from "../store/resizing";
import { useSettings } from "../store/settings";
import "../styles/blocks.css";

export interface TerminalPaneProps {
  paneId: string;
  focused?: boolean;
  /** The tab/workspace is currently visible and allowed to fit/focus. */
  visible?: boolean;
  onReady?: (paneId: string, term: Terminal, fit: FitAddon) => void;
}

const RESIZE_END_EVENT = "helm:pane-resize-end";
const LAYOUT_SETTLE_MS = 80;

export function TerminalPane({ paneId, focused, visible = true, onReady }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const openedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const focusedRef = useRef(focused);
  const visibleRef = useRef(visible);
  const refitRef = useRef<(refresh?: boolean) => void>(() => {});
  const [liveTerm, setLiveTerm] = useState<Terminal | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [newOutputLines, setNewOutputLines] = useState(0);
  onReadyRef.current = onReady;
  focusedRef.current = focused;
  visibleRef.current = visible;

  const termFont = useSettings((state) => state.termFont);
  const terminalFontSize = useSettings((state) => state.terminalFontSize);
  const terminalLineHeight = useSettings((state) => state.terminalLineHeight);
  const terminalScreenReaderMode = useSettings((state) => state.terminalScreenReaderMode);
  const paneCommand = usePanes((state) => state.panes[paneId]?.command ?? "");
  const paneCwd = usePanes((state) => state.panes[paneId]?.cwd ?? "");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initial = useSettings.getState();
    const font = TERM_FONTS[initial.termFont];
    const term = new Terminal({
      theme: terminalThemeFor(initial.theme),
      fontFamily: font.stack,
      fontSize: initial.terminalFontSize,
      lineHeight: initial.terminalLineHeight,
      letterSpacing: 0,
      fontWeight: 400,
      fontWeightBold: font.weightBold,
      cursorBlink: false,
      cursorStyle: "block",
      scrollback: 5000,
      smoothScrollDuration: 0,
      allowProposedApi: true,
      allowTransparency: false,
      screenReaderMode: initial.terminalScreenReaderMode,
    });
    termRef.current = term;

    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    try {
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = "11";
    } catch {
      // Keep xterm's default Unicode width handling if Unicode 11 activation is unavailable.
    }
    term.loadAddon(new WebLinksAddon((_event, uri) => { void openerOpen(uri); }));

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let unsubscribeResizing: (() => void) | null = null;
    const terminalSubscriptions: Array<{ dispose: () => void }> = [];
    let scrolledUp = false;
    let fitFrame: number | null = null;
    let layoutSettleTimer: number | null = null;
    let refreshOnFit = false;

    const applySettingsSnapshot = (snapshot = useSettings.getState()) => {
      const spec = TERM_FONTS[snapshot.termFont];
      term.options.fontFamily = spec.stack;
      term.options.fontWeightBold = spec.weightBold;
      term.options.fontSize = snapshot.terminalFontSize;
      term.options.lineHeight = snapshot.terminalLineHeight;
      term.options.theme = terminalThemeFor(snapshot.theme);
    };

    const fitNow = () => {
      fitFrame = null;
      if (
        cancelled ||
        !openedRef.current ||
        !visibleRef.current ||
        document.documentElement.dataset.paneResizing ||
        useResizing.getState().windowResizing
      ) return;
      if (host.clientWidth < 24 || host.clientHeight < 24) return;

      try {
        const dimensions = fit.proposeDimensions();
        if (dimensions && (dimensions.cols !== term.cols || dimensions.rows !== term.rows)) fit.fit();
        if (refreshOnFit && term.rows > 0) term.refresh(0, term.rows - 1);
      } catch {
        // A transient zero-sized host or a closing tab is safe to ignore.
      } finally {
        refreshOnFit = false;
      }
    };

    const scheduleFit = (refresh = false) => {
      refreshOnFit ||= refresh;
      if (fitFrame == null) fitFrame = requestAnimationFrame(fitNow);
    };
    const scheduleSettledFit = () => {
      if (layoutSettleTimer != null) window.clearTimeout(layoutSettleTimer);
      layoutSettleTimer = window.setTimeout(() => {
        layoutSettleTimer = null;
        scheduleFit(true);
      }, LAYOUT_SETTLE_MS);
    };
    refitRef.current = scheduleFit;

    const boot = async () => {
      // Settings can change while a font is loading (especially on first app
      // launch). Resolve the latest selected face, then apply one coherent
      // snapshot immediately before xterm measures its grid at open().
      let loadingFont = useSettings.getState().termFont;
      while (!cancelled) {
        await loadTermFont(loadingFont);
        if (cancelled) return;
        const latest = useSettings.getState();
        if (latest.termFont === loadingFont) {
          applySettingsSnapshot(latest);
          break;
        }
        loadingFont = latest.termFont;
      }
      if (cancelled) return;

      term.open(host);
      const loadCanvasRenderer = () => {
        try {
          term.loadAddon(new CanvasAddon());
          return true;
        } catch {
          // Canvas is unsupported on some WebKitGTK/WSLg webviews; keep xterm's DOM renderer.
          return false;
        }
      };
      if (initial.renderer === "webgl") {
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => {
            webgl.dispose();
            if (!cancelled) loadCanvasRenderer();
          });
          term.loadAddon(webgl);
        } catch {
          loadCanvasRenderer();
        }
      } else {
        loadCanvasRenderer();
      }
      openedRef.current = true;
      setLiveTerm(term);
      terminalSubscriptions.push(
        term.onScroll((viewportY) => {
          scrolledUp = viewportY < term.buffer.active.baseY;
          if (!scrolledUp) setNewOutputLines(0);
        }),
        term.onLineFeed(() => {
          if (scrolledUp && term.buffer.active.type === "normal") {
            setNewOutputLines((count) => Math.min(9_999, count + 1));
          }
        }),
      );
      if (visibleRef.current && host.clientWidth >= 24 && host.clientHeight >= 24) {
        try {
          fit.fit();
          if (term.rows > 0) term.refresh(0, term.rows - 1);
        } catch {
          scheduleFit(true);
        }
      } else {
        scheduleFit(true);
      }

      onReadyRef.current?.(paneId, term, fit);
      if (visibleRef.current && focusedRef.current) term.focus();

      observer = new ResizeObserver(() => {
        // Divider and native window drags intentionally stretch/crop the active
        // canvas. Their settle signals each dispatch one definitive refit.
        if (
          document.documentElement.dataset.paneResizing ||
          useResizing.getState().windowResizing
        ) return;
        scheduleFit();
        scheduleSettledFit();
      });
      observer.observe(host);
      unsubscribeResizing = useResizing.subscribe((state, previousState) => {
        if (previousState.windowResizing && !state.windowResizing) scheduleFit(true);
      });
      window.addEventListener(RESIZE_END_EVENT, onResizeEnd);
    };

    const onResizeEnd = () => scheduleFit(true);
    void boot().catch((error) => {
      console.error("Terminal pane failed to initialize", error);
    });

    // The selected face is awaited before open; this catches any later font-set
    // changes and refreshes xterm's metrics as a backstop.
    void document.fonts.ready.then(() => {
      if (!cancelled && openedRef.current) {
        applySettingsSnapshot();
        scheduleFit(true);
      }
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      unsubscribeResizing?.();
      terminalSubscriptions.forEach((subscription) => subscription.dispose());
      window.removeEventListener(RESIZE_END_EVENT, onResizeEnd);
      if (fitFrame != null) cancelAnimationFrame(fitFrame);
      if (layoutSettleTimer != null) window.clearTimeout(layoutSettleTimer);
      refitRef.current = () => {};
      term.dispose();
      openedRef.current = false;
      setLiveTerm(null);
      setContextMenu(null);
      setNewOutputLines(0);
      termRef.current = null;
      fitRef.current = null;
    };
  }, [paneId]);

  // Font controls apply in place. This avoids process restarts and keeps the
  // alternate screen/scrollback intact while xterm remeasures once.
  useEffect(() => {
    if (!openedRef.current) return;
    const term = termRef.current;
    if (!term) return;
    let cancelled = false;
    void (async () => {
      await loadTermFont(termFont);
      if (cancelled || termRef.current !== term) return;
      const spec = TERM_FONTS[termFont];
      term.options.fontFamily = spec.stack;
      term.options.fontWeightBold = spec.weightBold;
      term.options.fontSize = terminalFontSize;
      term.options.lineHeight = terminalLineHeight;
      refitRef.current(true);
    })();
    return () => { cancelled = true; };
  }, [termFont, terminalFontSize, terminalLineHeight]);

  useEffect(() => {
    if (openedRef.current && termRef.current) {
      termRef.current.options.screenReaderMode = terminalScreenReaderMode;
    }
  }, [terminalScreenReaderMode]);

  // An inactive tab stays mounted but does no fit/focus work. On activation we
  // wait one frame, fit once, then force a full paint—fixing full-screen TUIs.
  useEffect(() => {
    if (!visible || !openedRef.current) return;
    refitRef.current(true);
    if (!focused) return;
    const term = termRef.current;
    const focusFrame = requestAnimationFrame(() => {
      if (
        termRef.current === term &&
        openedRef.current &&
        visibleRef.current &&
        focusedRef.current
      ) {
        // Activating a tab from its tablist must not pull keyboard focus into
        // xterm; otherwise one ArrowRight works and the next never reaches the
        // tablist. Non-tab activation paths still focus the terminal normally.
        const active = document.activeElement;
        const focusIsInTabList = active instanceof HTMLElement && Boolean(active.closest('[role="tablist"]'));
        if (!focusIsInTabList) term?.focus();
      }
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [visible, focused]);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const paths = droppedPaths(event.dataTransfer);
    event.currentTarget.removeAttribute("data-dragging");
    if (!liveTerm || paths.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const windowsShell = /(?:powershell|pwsh|cmd)(?:\.exe)?$/i.test(paneCommand.trim())
      || /^[A-Za-z]:[\\/]/.test(paneCwd);
    liveTerm.paste(`${quoteDroppedPaths(paths, windowsShell)} `);
    liveTerm.focus();
  };

  return (
    <div
      className="term-pane"
      onContextMenu={(event) => {
        if (!liveTerm) return;
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onDragOver={(event) => {
        if (droppedPaths(event.dataTransfer).length === 0 && !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        event.currentTarget.dataset.dragging = "true";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          event.currentTarget.removeAttribute("data-dragging");
        }
      }}
      onDrop={onDrop}
    >
      <div
        className="term-host"
        ref={hostRef}
        data-visible={visible ? "true" : "false"}
        role="region"
        aria-label="Interactive terminal output"
      />
      {liveTerm && <BlockGutter paneId={paneId} term={liveTerm} />}
      <TerminalSearch paneId={paneId} />
      <ScrollPill
        count={newOutputLines}
        onJump={() => {
          liveTerm?.scrollToBottom();
          setNewOutputLines(0);
        }}
      />
      {liveTerm && contextMenu && (
        <TermContextMenu
          paneId={paneId}
          term={liveTerm}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
