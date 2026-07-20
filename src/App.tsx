/* ══════════════════════════════════════════════════════════════════════════
   helm — cockpit shell (Track B). The mockup/cockpit.html IA ported to React:
   titlebar · [rail · sidebar · center(tabs+split panes) · stage] · status bar.
   Chrome visibility (sidebar collapse, stage reveal) reads useLayout; everything
   else reads the panes/roster/stage stores. Settings is a modal owned here.

   Phase-3 (integrator): pass an onTermReady handler down to <SplitPanes> to wire
   PTY bytes — signature: (paneId, term, fit) => void  (see TerminalPane.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import "./styles/components.css";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { LazyMotion, domAnimation, m, AnimatePresence, MotionConfig } from "motion/react";
import { pageMotion, revealMotion } from "./lib/motion";
import { useLayout, SIDEBAR_MIN, SIDEBAR_MAX, STAGE_MIN, STAGE_MAX, type WorkspaceView } from "./store/layout";
import { usePanes } from "./store/panes";
import { useStage } from "./store/stage";
import { useSettings } from "./store/settings";
import { usePalette } from "./store/palette";
import { useResizing } from "./store/resizing";
import { useLightbox } from "./store/lightbox";
import { useNotifications } from "./store/notifications";
import { registerSurfaceHandler, type SurfaceId } from "./lib/commands";
import { bootstrapApp } from "./lib/bootstrap";
import { parseOsc } from "./lib/osc";
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
import { Omnibar } from "./components/Omnibar";
import { NotificationCenter } from "./components/NotificationCenter";
import { ShortcutCheatsheet } from "./components/ShortcutCheatsheet";
import { FleetHome } from "./components/FleetHome";
import { AttentionInbox } from "./components/AttentionInbox";
import { TemplatePicker } from "./components/TemplatePicker";
import { PromptsLibrary } from "./components/PromptsLibrary";
import { SkillsPanel } from "./components/SkillsPanel";
import { AgentsPage } from "./components/AgentsPage";
import type { SettingsSection } from "./components/Settings";
import { OnboardingWizard, ONBOARDING_VERSION } from "./components/onboarding/OnboardingWizard";

// These substantial, occasional workspaces stay out of the terminal-first
// startup path. Tauri serves the chunks locally, so their first reveal remains
// effectively instant while initial parse/memory stays lean.
const Settings = lazy(() => import("./components/Settings").then((module) => ({ default: module.Settings })));
const AgentManager = lazy(() => import("./components/AgentManager").then((module) => ({ default: module.AgentManager })));
// Mission Control center surfaces (U1) — lazy so the fleet/board/swarm/memory/
// editor/preview chunks load on first reveal, never on the terminal-first boot.
const BoardView = lazy(() => import("./components/BoardView").then((m) => ({ default: m.BoardView })));
const SwarmView = lazy(() => import("./components/SwarmView").then((m) => ({ default: m.SwarmView })));
const MemoryView = lazy(() => import("./components/MemoryView").then((m) => ({ default: m.MemoryView })));
const PreviewPane = lazy(() => import("./components/PreviewPane").then((m) => ({ default: m.PreviewPane })));
const EditorTabs = lazy(() => import("./components/EditorTabs").then((m) => ({ default: m.EditorTabs })));
const EditorPane = lazy(() => import("./components/EditorPane").then((m) => ({ default: m.EditorPane })));

/** Map a settings SurfaceId to the Settings modal's section (the registry names
    a couple of sections the modal folds into general). */
const SETTINGS_SECTION: Record<string, SettingsSection> = {
  "settings.appearance": "appearance",
  "settings.terminal": "terminal",
  "settings.profiles": "profiles",
  "settings.performance": "general",
  "settings.modelhub": "models",
  "settings.voice": "voice",
  "settings.updates": "updates",
};

interface BridgeStageEvent {
  pane: unknown;
  payload: unknown;
  requestId: unknown;
}

export default function App() {
  const sidebar = useLayout((s) => s.sidebar);
  const stageOpen = useLayout((s) => s.stageOpen);
  const openStage = useLayout((s) => s.openStage);
  const workspaceView = useLayout((s) => s.workspaceView);
  const setWorkspaceView = useLayout((s) => s.setWorkspaceView);
  // U1 · Mission Control surfaces: the attention overlay + the single modal slot.
  const attentionOpen = useLayout((s) => s.attentionOpen);
  const openAttention = useLayout((s) => s.openAttention);
  const closeAttention = useLayout((s) => s.closeAttention);
  const modalSurface = useLayout((s) => s.modalSurface);
  const openModal = useLayout((s) => s.openModal);
  const closeModal = useLayout((s) => s.closeModal);
  // WS-2 · draggable top-level widths + their collapse/commit setters.
  const sidebarWidth = useLayout((s) => s.sidebarWidth);
  const stageWidth = useLayout((s) => s.stageWidth);
  const setSidebarWidth = useLayout((s) => s.setSidebarWidth);
  const setStageWidth = useLayout((s) => s.setStageWidth);
  const setSidebar = useLayout((s) => s.setSidebar);
  const closeStage = useLayout((s) => s.closeStage);
  const accentGlow = useSettings((s) => s.accentGlow);
  const densityMode = useSettings((s) => s.densityMode);
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

  // First-run onboarding gate: show automatically until the current
  // ONBOARDING_VERSION is stamped, or on explicit re-run from Settings. The
  // re-run flag lives here (App-local) rather than in the layout store's
  // ModalSurface, which doesn't carry an "onboarding" surface.
  const onboardingVersion = useSettings((s) => s.onboardingCompletedVersion);
  const [onboardingReopen, setOnboardingReopen] = useState(false);
  const showOnboarding =
    onboardingReopen || onboardingVersion === null || onboardingVersion < ONBOARDING_VERSION;
  const closeOnboarding = useCallback(() => setOnboardingReopen(false), []);

  const openSettings = useCallback((section: SettingsSection = "appearance") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const runOnboarding = useCallback(() => {
    setSettingsOpen(false);
    setOnboardingReopen(true);
  }, []);
  const openAppearanceSettings = useCallback(() => openSettings("appearance"), [openSettings]);
  const openAgentProfiles = useCallback(() => openSettings("profiles"), [openSettings]);
  const openUpdates = useCallback(() => openSettings("updates"), [openSettings]);

  // U1 · the center-surface renderer. Fleet Home is eager (the home screen must
  // reveal instantly); board/swarm/memory/editor/preview lazy-load on first show.
  const renderSurface = (view: WorkspaceView) => {
    switch (view) {
      case "agents": return <AgentManager onManageProfiles={openAgentProfiles} />;
      case "fleet": return <FleetHome onOpenSettings={openSettings} />;
      case "board": return <BoardView />;
      case "swarm": return <SwarmView />;
      case "memory": return <MemoryView />;
      case "editor": return (<><EditorTabs /><EditorPane /></>);
      case "preview": return <PreviewPane />;
      default: return null;
    }
  };

  // U1 · the ONE surface router. Palette/omnibar commands, rail buttons, and the
  // registered shortcuts all reach openSurface() → this handler, so every surface
  // has a single entry point. Registered once at mount.
  useEffect(() => {
    return registerSurfaceHandler((id: SurfaceId) => {
      switch (id) {
        case "board":
        case "swarm":
        case "memory":
          setWorkspaceView(id);
          break;
        case "attention":
          openAttention();
          break;
        case "templates":
        case "prompts":
        case "skills":
        case "agents":
          openModal(id);
          break;
        case "quick-open":
          usePalette.getState().show("#"); // the omnibar's file mode IS quick-open
          break;
        case "theme-gallery":
          openSettings("appearance"); // the gallery lives in Appearance (U4)
          break;
        case "dispatch-card":
          usePalette.getState().show("+"); // land the omnibar straight in task mode
          break;
        default:
          if (id.startsWith("settings.")) openSettings(SETTINGS_SECTION[id] ?? "general");
      }
    });
  }, [setWorkspaceView, openAttention, openModal, openSettings]);

  // U1 · Fleet Home becomes the default surface once the operation has >1 session
  // (a restored multi-tab workspace). One-shot, and only from the terminal
  // default — it never overrides a view the operator already chose.
  const didAutoView = useRef(false);
  useEffect(() => {
    if (didAutoView.current) return;
    let unsubscribe = () => {};
    const decide = () => {
      if (didAutoView.current) return;
      if (Object.keys(usePanes.getState().panes).length > 1) {
        didAutoView.current = true;
        if (useLayout.getState().workspaceView === "terminal") useLayout.getState().setWorkspaceView("fleet");
        unsubscribe();
      }
    };
    unsubscribe = usePanes.subscribe(decide);
    decide();
    const settle = window.setTimeout(() => { didAutoView.current = true; unsubscribe(); }, 4000);
    return () => { window.clearTimeout(settle); unsubscribe(); };
  }, []);

  // Phase-3 PTY seam: drop the demo scrollback, then attach the pane's live PTY.
  const handleTermReady = useCallback<NonNullable<TerminalPaneProps["onReady"]>>(
    (paneId, term, fit) => {
      void attachPtyToTerminal(paneId, term, fit);
    },
    [],
  );

  // MCP bridge: validate the already-decoded object through the exact OSC parser
  // guards, require a live pane, then surface it through the normal Stage path.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<BridgeStageEvent>("bridge://stage", (event) => {
      const message = event.payload;
      if (
        typeof message.pane !== "string" ||
        typeof message.requestId !== "string" ||
        message.requestId.length === 0
      ) return;
      const pane = usePanes.getState().panes[message.pane];
      if (!pane) return;

      let raw: string | undefined;
      try {
        raw = JSON.stringify(message.payload);
      } catch {
        return;
      }
      if (raw === undefined) return;
      const payload = parseOsc(raw);
      if (!payload) return;

      useStage.getState().push({
        paneId: message.pane,
        agent: pane.agent,
        payload,
        reveal: true,
        bridgeRequestId: message.requestId,
      });
      // Bridge pushes bypass the terminal's OSC path, so they emit their own
      // Activity notification (mirrors terminal-session's pushOsc).
      useNotifications.getState().notify({
        kind: "hook",
        title: "New bridge activity",
        body: "label" in payload && payload.label ? payload.label : payload.t,
        paneId: message.pane,
        ts: Date.now(),
      });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => {
      // Browser development has no Tauri event target; the bridge is desktop-only.
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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

  // ⌘K / Ctrl+K — handled by the shortcut REGISTRY (lib/shortcuts registers the
  // global "palette.open" shortcut at bootstrap; its capture-phase window
  // listener fires before xterm's textarea and stopImmediatePropagation()s the
  // key, so \x0b never reaches the PTY). No App-level hotkey lives here anymore.

  // §12.2 density axis — mirror the setting onto <html data-density>, the same
  // channel applyTheme uses for data-theme; tokens.css's compact re-map keys
  // off the attribute. Cozy is written explicitly as a faithful 1:1 mirror.
  useEffect(() => {
    document.documentElement.setAttribute("data-density", densityMode);
  }, [densityMode]);

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
            <ActivityRail
              settingsOpen={settingsOpen}
              onOpenSettings={openAppearanceSettings}
              onOpenUpdates={openUpdates}
            />
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
                {/* U1 · every non-terminal center surface reveals here, keyed on
                    the view so switching board→memory animates as one clean swap.
                    The terminal deck above stays MOUNTED (display-toggled), so its
                    PTYs never die when Fleet Home / Board / … is on top. */}
                <AnimatePresence mode="wait" initial={false}>
                  {workspaceView !== "terminal" && (
                    <m.div
                      className={workspaceView === "agents" ? "agent-workspace" : "mc-surface"}
                      key={workspaceView}
                      {...(workspaceView === "agents"
                        ? { role: "tabpanel", id: "agents-panel", "aria-labelledby": "agents-tab" }
                        : { role: "region", "aria-label": workspaceView })}
                      {...pageMotion}
                    >
                      <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
                        {renderSurface(workspaceView)}
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
                <Settings initialSection={settingsSection} onClose={closeSettings} onRunSetup={runOnboarding} />
              )}
            </AnimatePresence>
          </Suspense>

          {/* WS-6 · image lightbox — a sibling of the Settings modal, mounted once
              and store-driven. AnimatePresence lets the scrim + image animate their
              exit (scrimMotion / modalMotion) before unmounting. */}
          <AnimatePresence>
            {lightboxUrl && <ImageLightbox />}
          </AnimatePresence>

          {/* ⌘K Omnibar (U1) — the evolved command palette: one input, prefix-
              routed (> run · @ agent · # file · + task). Store-driven (usePalette),
              instant open/close (§8 palette gate → no AnimatePresence). */}
          <Omnibar onOpenSettings={openSettings} />

          {/* v3.1 · Activity drawer + shortcut cheatsheet — store-driven
              (useNotifications / useCheatsheet), occasional overlays with
              animated enter/exit (§12.5 drawer/overlay presets). */}
          <NotificationCenter />
          <ShortcutCheatsheet />

          {/* U1 · Attention inbox (§4.7) — the glass overlay driven by the layout
              store; the rail toggle AND Ctrl+Shift+A (→ attention.open command)
              both open it. Self-gates on `open`. */}
          <AttentionInbox open={attentionOpen} onClose={closeAttention} />

          {/* U1 · single-slot modal surfaces, opened via openSurface() (palette /
              rail / shortcut). Each self-gates on `open`, so only the active one
              paints; roots derive their own .helm project path. */}
          <TemplatePicker open={modalSurface === "templates"} onClose={closeModal} />
          <PromptsLibrary open={modalSurface === "prompts"} onClose={closeModal} />
          <SkillsPanel open={modalSurface === "skills"} onClose={closeModal} />
          <AgentsPage open={modalSurface === "agents"} onClose={closeModal} />

          {/* First-run onboarding wizard (v0.5) — the very first surface a new
              user meets. Gated on the settings version stamp or an explicit
              Settings → Run setup re-run; the glass overlay animates its own
              scrim/plate enter+exit, so it lives inside AnimatePresence. */}
          <AnimatePresence>
            {showOnboarding && (
              <OnboardingWizard onOpenSettings={openSettings} onClose={closeOnboarding} />
            )}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
