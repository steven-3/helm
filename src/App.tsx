/* ══════════════════════════════════════════════════════════════════════════
   helm — cockpit shell (Track B). The mockup/cockpit.html IA ported to React:
   titlebar · [rail · sidebar · center(tabs+split panes) · stage] · status bar.
   Chrome visibility (sidebar collapse, stage reveal) reads useLayout; everything
   else reads the panes/roster/stage stores. Settings is a modal owned here.

   Phase-3 (integrator): pass an onTermReady handler down to <SplitPanes> to wire
   PTY bytes — signature: (paneId, term, fit) => void  (see TerminalPane.tsx).
   ══════════════════════════════════════════════════════════════════════════ */
import "./styles/components.css";
import { useCallback, useEffect, useState } from "react";
import { useLayout } from "./store/layout";
import { usePanes } from "./store/panes";
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
import { Settings } from "./components/Settings";

export default function App() {
  const sidebar = useLayout((s) => s.sidebar);
  const stageOpen = useLayout((s) => s.stageOpen);
  const openStage = useLayout((s) => s.openStage);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [glow, setGlow] = useState(false);

  // Phase-3 PTY seam: drop the demo scrollback, then attach the pane's live PTY.
  const handleTermReady = useCallback<NonNullable<TerminalPaneProps["onReady"]>>(
    (paneId, term, fit) => {
      void attachPtyToTerminal(paneId, term, fit);
    },
    [],
  );

  // Reap PTYs whose pane/tab was closed (kills orphaned native processes).
  useEffect(() => {
    const alive = () => new Set(Object.keys(usePanes.getState().panes));
    reconcileSessions(alive());
    return usePanes.subscribe(() => reconcileSessions(alive()));
  }, []);

  return (
    <div className="app" data-glow={glow ? "on" : "off"}>
      <IconSprite />
      <Titlebar />

      <div className="body">
        <ActivityRail settingsOpen={settingsOpen} onOpenSettings={() => setSettingsOpen(true)} />
        {sidebar !== null && <Sidebar />}

        <main className="center">
          <TabBar />
          <SplitPanes onTermReady={handleTermReady} />
        </main>

        {stageOpen ? (
          <Stage />
        ) : (
          <div className="stage-reveal">
            <button aria-label="Reveal Stage" onClick={() => openStage()}>
              <Icon name="ic-chev" size="sm" />
            </button>
          </div>
        )}
      </div>

      <StatusBar />

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} glow={glow} onGlowChange={setGlow} />
      )}
    </div>
  );
}
