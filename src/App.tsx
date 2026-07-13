/* ══════════════════════════════════════════════════════════════════════════
   helm — cockpit shell (Track B). The mockup/cockpit.html IA ported to React:
   titlebar · [rail · sidebar · center(tabs+split panes) · stage] · status bar.
   Chrome visibility (sidebar collapse, stage reveal) reads useLayout; everything
   else reads the panes/roster/stage stores. Settings is a modal owned here.

   Phase-3 (integrator): pass an onTermReady handler down to <SplitPanes> to wire
   PTY bytes — signature: (paneId, term, fit) => void  (see TerminalPane.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import "./styles/components.css";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence, MotionConfig } from "motion/react";
import { pageMotion, revealMotion } from "./lib/motion";
import { useLayout } from "./store/layout";
import { usePanes } from "./store/panes";
import { useSettings } from "./store/settings";
import { bootstrapApp } from "./lib/bootstrap";
import { attachPtyToTerminal, reconcileSessions } from "./lib/terminal-session";
import type { TerminalPaneProps } from "./components/TerminalPane";
import { IconSprite, Icon } from "./components/icons";
import { Titlebar } from "./components/Titlebar";
import { ActivityRail } from "./components/ActivityRail";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { SplitPanes } from "./components/SplitPanes";
import { Stage } from "./components/Stage";
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
  const accentGlow = useSettings((s) => s.accentGlow);

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

  return (
    // Motion providers: LazyMotion(domAnimation) keeps the bundle lean (m.* only,
    // strict bans the heavy `motion` proxy); MotionConfig reducedMotion="user"
    // makes EVERY occasional motion drop transform/scale but keep its opacity
    // fade under prefers-reduced-motion (§8: reduce ≠ zero) — one global switch.
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="app" data-glow={accentGlow ? "on" : "off"}>
          <IconSprite />
          <Titlebar />

          <div className="body">
            <ActivityRail settingsOpen={settingsOpen} onOpenSettings={openAppearanceSettings} />
            {sidebar !== null && <Sidebar />}

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

            {/* Stage dock reveal/collapse — occasional (§8 gate-OK). mode="wait"
                so the 300px dock and the 24px reveal strip never co-occupy the
                row (one clean reflow at the swap, not a double-occupancy jump);
                initial={false} suppresses any animation on first paint. */}
            <AnimatePresence mode="wait" initial={false}>
              {workspaceView === "terminal" && stageOpen ? (
                <Stage key="stage" />
              ) : workspaceView === "terminal" ? (
                <m.div className="stage-reveal" key="reveal" {...revealMotion}>
                  <button aria-label="Reveal Stage" onClick={() => openStage()}>
                    <Icon name="ic-chev" size="sm" />
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
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
