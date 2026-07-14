/* ══════════════════════════════════════════════════════════════════════════
   helm — cockpit shell (Track B). The mockup/cockpit.html IA ported to React:
   titlebar · [rail · sidebar · center(tabs+split panes) · stage] · status bar.
   Chrome visibility (sidebar collapse, stage reveal) reads useLayout; everything
   else reads the panes/roster/stage stores. Settings is a modal owned here.

   Phase-3 (integrator): pass an onTermReady handler down to <SplitPanes> to wire
   PTY bytes — signature: (paneId, term, fit) => void  (see TerminalPane.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import "./styles/components.css";
import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence, MotionConfig } from "motion/react";
import { pageMotion, revealMotion } from "./lib/motion";
import { useLayout, SIDEBAR_MIN, SIDEBAR_MAX, STAGE_MIN, STAGE_MAX } from "./store/layout";
import { usePanes } from "./store/panes";
import { useStage } from "./store/stage";
import { useSettings } from "./store/settings";
import { useResizing } from "./store/resizing";
import { useLightbox } from "./store/lightbox";
import { bootstrapApp } from "./lib/bootstrap";
import { attachPtyToTerminal, reconcileSessions } from "./lib/terminal-session";
import type { TerminalPaneProps } from "./components/TerminalPane";
import { IconSprite, Icon } from "./components/icons";
import { Titlebar } from "./components/Titlebar";
import { WindowResizeGrips } from "./components/WindowResizeGrips";
import { ActivityRail } from "./components/ActivityRail";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { SplitPanes } from "./components/SplitPanes";
import { TopSplitter } from "./components/TopSplitter";
import { Stage } from "./components/Stage";
import { ImageLightbox } from "./components/ImageLightbox";
import { StatusBar } from "./components/StatusBar";
import type { SettingsSection } from "./components/Settings";

// These substantial, occasional workspaces stay out of the terminal-first
// startup path. Tauri serves the chunks locally, so their first reveal remains
// effectively instant while initial parse/memory stays lean.
const Settings = lazy(() => import("./components/Settings").then((module) => ({ default: module.Settings })));
const AgentManager = lazy(() => import("./components/AgentManager").then((module) => ({ default: module.AgentManager })));

export default function App() {
  const sidebar = useLayout((s) => s.sidebar);
  const stageOpen = useLayout((s) => s.stageOpen);
  const openStage = useLayout((s) => s.openStage);
  const workspaceView = useLayout((s) => s.workspaceView);
  // WS-2 · draggable top-level widths + their collapse/commit setters.
  const sidebarWidth = useLayout((s) => s.sidebarWidth);
  const stageWidth = useLayout((s) => s.stageWidth);
  const setSidebarWidth = useLayout((s) => s.setSidebarWidth);
  const setStageWidth = useLayout((s) => s.setStageWidth);
  const setSidebar = useLayout((s) => s.setSidebar);
  const closeStage = useLayout((s) => s.closeStage);
  const accentGlow = useSettings((s) => s.accentGlow);
  const setWindowResizing = useResizing((s) => s.setWindowResizing);

  // WS-6 · lightbox mount slot (store-driven) + the collapsed-dock unread signal.
  const lightboxUrl = useLightbox((s) => s.url);
  const focusedPaneId = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ? tab.activePaneId : undefined;
  });
  // Detector cards arrive with reveal:false, so the dock stays closed — a quiet
  // indigo dot on the reveal strip is the only signal that the focused pane has
  // undismissed widgets waiting behind it. Boolean selector → no re-render churn.
  const hasUnreadWidgets = useStage((s) =>
    focusedPaneId ? s.widgets.some((w) => w.paneId === focusedPaneId) : false,
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");

  const openSettings = useCallback((section: SettingsSection = "appearance") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openAppearanceSettings = useCallback(() => openSettings("appearance"), [openSettings]);
  const openAgentProfiles = useCallback(() => openSettings("profiles"), [openSettings]);

  // Phase-3 PTY seam: drop the demo scrollback, then attach the pane's live PTY.
  const handleTermReady = useCallback<NonNullable<TerminalPaneProps["onReady"]>>(
    (paneId, term, fit) => {
      void attachPtyToTerminal(paneId, term, fit);
    },
    [],
  );

  // Boot: resolve the real env (home/$SHELL) and spawn the first real pane.
  useEffect(() => {
    void bootstrapApp();
  }, []);

  // Reap PTYs whose pane/tab was closed (kills orphaned native processes).
  useEffect(() => {
    let previousPaneIds = new Set(Object.keys(usePanes.getState().panes));
    reconcileSessions(previousPaneIds);
    return usePanes.subscribe((state) => {
      const paneIds = Object.keys(state.panes);
      if (paneIds.length === previousPaneIds.size && paneIds.every((id) => previousPaneIds.has(id))) return;
      previousPaneIds = new Set(paneIds);
      reconcileSessions(previousPaneIds);
    });
  }, []);

  // WS-1 · Window-resize gate. While the OS resize gesture streams onResized
  // events, flip the useResizing flag + a <body data-window-resizing> attribute:
  // components.css swaps the heavy full-window gradients for a flat opaque paint
  // (killing per-frame alpha+gradient compositing) and WS-3 can suspend xterm
  // reflow off the same flag. A trailing ~150ms debounce clears both on settle.
  // No-op outside Tauri (browser dev / visual-verify) — the window API call throws there, not the import.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const clearResizing = () => {
      setWindowResizing(false);
      document.body.removeAttribute("data-window-resizing");
    };

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const un = await getCurrentWindow().onResized(() => {
          setWindowResizing(true);
          document.body.setAttribute("data-window-resizing", "true");
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(clearResizing, 150);
        });
        if (disposed) un();            // unmounted before the listener resolved
        else unlisten = un;
      } catch {
        /* not inside Tauri — no window events to gate on */
      }
    })();

    return () => {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      unlisten?.();
      clearResizing();
    };
  }, [setWindowResizing]);

  // WS-2 (WS-1 fold-in) · Maximize squares the shell corners. The shell rounds to
  // --radius-shell (12px) under a transparent, decorations:false window; maximized
  // to the screen edge those rounded corners would clip against bare desktop. We
  // mirror the window's maximize state onto <body data-maximized> (the same
  // channel as data-window-resizing) so components.css can flatten .app to 0.
  // isMaximized() is checked on a short debounce off onResized (maximize/restore
  // both change the window size), never per drag frame. No-op outside Tauri.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const sync = () =>
          void win.isMaximized().then(
            (max) => document.body.toggleAttribute("data-maximized", max),
            () => {},
          );
        sync(); // initial state (e.g. launched maximized)
        const un = await win.onResized(() => {
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(sync, 100);
        });
        if (disposed) un();
        else unlisten = un;
      } catch {
        /* not inside Tauri — no window to observe */
      }
    })();

    return () => {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      unlisten?.();
      document.body.removeAttribute("data-maximized");
    };
  }, []);

  return (
    // Motion providers: LazyMotion(domAnimation) keeps the bundle lean (m.* only,
    // strict bans the heavy `motion` proxy); MotionConfig reducedMotion="user"
    // makes EVERY occasional motion drop transform/scale but keep its opacity
    // fade under prefers-reduced-motion (§8: reduce ≠ zero) — one global switch.
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div
          className="app"
          data-glow={accentGlow ? "on" : "off"}
          // WS-2 · the dragged plate widths ride custom props on the painted root;
          // .sidebar / .stage read var(--sidebar-width) / var(--stage-width). The
          // TopSplitter writes these imperatively mid-drag (no re-render), then the
          // committed value re-applies here on release — same value, no jump.
          style={{ "--sidebar-width": `${sidebarWidth}px`, "--stage-width": `${stageWidth}px` } as CSSProperties}
        >
          <IconSprite />
          <WindowResizeGrips />
          <Titlebar />

          <div className="body">
            <ActivityRail settingsOpen={settingsOpen} onOpenSettings={openAppearanceSettings} />
            {sidebar !== null && <Sidebar />}
            {sidebar !== null && (
              <TopSplitter
                side="sidebar"
                width={sidebarWidth}
                min={SIDEBAR_MIN}
                max={SIDEBAR_MAX}
                collapseAt={SIDEBAR_MIN - 40}
                cssVar="--sidebar-width"
                label="Resize sidebar"
                onCommit={setSidebarWidth}
                onCollapse={() => setSidebar(null)}
              />
            )}

            <main className="center">
              <TabBar />
              <div className="workspace-deck">
                <div
                  className={`terminal-workspace${workspaceView === "terminal" ? " active" : ""}`}
                  aria-hidden={workspaceView !== "terminal"}
                >
                  <SplitPanes
                    onTermReady={handleTermReady}
                    visible={workspaceView === "terminal"}
                  />
                </div>
                <AnimatePresence initial={false}>
                  {workspaceView === "agents" && (
                    <m.div
                      className="agent-workspace"
                      key="agents"
                      role="tabpanel"
                      id="agents-panel"
                      aria-labelledby="agents-tab"
                      {...pageMotion}
                    >
                      <Suspense fallback={<div className="workspace-loading">Loading agents…</div>}>
                        <AgentManager onManageProfiles={openAgentProfiles} />
                      </Suspense>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </main>

            {/* WS-2 · center↔Stage splitter. Rendered (in flow) only when the
                Stage dock is actually shown; below 1400px the Stage floats as an
                overlay and this splitter is display:none'd (no in-flow seam). It
                sits OUTSIDE the AnimatePresence so it never animates (§8 gate). */}
            {workspaceView === "terminal" && stageOpen && (
              <TopSplitter
                side="stage"
                width={stageWidth}
                min={STAGE_MIN}
                max={STAGE_MAX}
                collapseAt={STAGE_MIN - 40}
                cssVar="--stage-width"
                label="Resize Stage"
                onCommit={setStageWidth}
                onCollapse={closeStage}
              />
            )}

            {/* Stage dock reveal/collapse — occasional (§8 gate-OK). mode="wait"
                so the 300px dock and the 24px reveal strip never co-occupy the
                row (one clean reflow at the swap, not a double-occupancy jump);
                initial={false} suppresses any animation on first paint. */}
            <AnimatePresence mode="wait" initial={false}>
              {workspaceView === "terminal" && stageOpen ? (
                <Stage key="stage" />
              ) : workspaceView === "terminal" ? (
                <m.div className="stage-reveal" key="reveal" {...revealMotion}>
                  <button
                    aria-label={hasUnreadWidgets ? "Reveal Stage — new widgets" : "Reveal Stage"}
                    onClick={() => openStage()}
                  >
                    <Icon name="ic-chev" size="sm" />
                    {hasUnreadWidgets && <span className="stage-unread" aria-hidden="true" />}
                  </button>
                </m.div>
              ) : null}
            </AnimatePresence>
          </div>

          <StatusBar />

          {/* Settings modal — AnimatePresence lives OUTSIDE the mount gate so the
              scrim + modal can animate their exit before unmounting. */}
          <Suspense fallback={null}>
            <AnimatePresence>
              {settingsOpen && (
                <Settings initialSection={settingsSection} onClose={closeSettings} />
              )}
            </AnimatePresence>
          </Suspense>

          {/* WS-6 · image lightbox — a sibling of the Settings modal, mounted once
              and store-driven. AnimatePresence lets the scrim + image animate their
              exit (scrimMotion / modalMotion) before unmounting. */}
          <AnimatePresence>
            {lightboxUrl && <ImageLightbox />}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
