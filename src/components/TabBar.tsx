/* ══════════════════════════════════════════════════════════════════════════
   TabBar (e1) — tabs from usePanes. Active tab = surface-base (continuous with
   the terminal well below) + a top agent-colour identity strip drawn from its
   active pane; inactive = surface-panel + secondary text. Close → closeTab; the
   + button → addTab (a fresh shell — the store fills the real $SHELL/home).
   ══════════════════════════════════════════════════════════════════════════ */
import { useRef, type KeyboardEvent } from "react";
import { usePanes } from "../store/panes";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import { useLayout } from "../store/layout";

export function TabBar() {
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabs = usePanes((s) => s.tabs);
  const panes = usePanes((s) => s.panes);
  const activeTabId = usePanes((s) => s.activeTabId);
  const setActiveTab = usePanes((s) => s.setActiveTab);
  const closeTab = usePanes((s) => s.closeTab);
  const addTab = usePanes((s) => s.addTab);
  const workspaceView = useLayout((s) => s.workspaceView);
  const setWorkspaceView = useLayout((s) => s.setWorkspaceView);

  let needsInputCount = 0;
  let finishedCount = 0;
  for (const pane of Object.values(panes)) {
    if (pane.state === "needs-input") needsInputCount++;
    else if (pane.state === "done") finishedCount++;
  }

  const activateTerminalTab = (tabId: string) => {
    setActiveTab(tabId);
    setWorkspaceView("terminal");
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabList = tabListRef.current;
    if (!tabList) return;
    const tabsInOrder = Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const currentIndex = tabsInOrder.indexOf(event.currentTarget);
    if (currentIndex < 0) return;

    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabsInOrder.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabsInOrder.length) % tabsInOrder.length;
    const nextTab = tabsInOrder[nextIndex];
    nextTab.focus();
    nextTab.click();
  };

  const closeTerminalTab = (tabId: string) => {
    closeTab(tabId);
    requestAnimationFrame(() => {
      const selected = tabListRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
      selected?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Workspace tabs" ref={tabListRef}>
      <div className="terminal-tabs" role="presentation">
        {tabs.map((tab) => {
        const active = workspaceView === "terminal" && tab.id === activeTabId;
        const pane = panes[tab.activePaneId];
        const key = pane ? agentVis(pane.agent).key : "gn";
        return (
          <div
            key={tab.id}
            role="presentation"
            className={`tab${active ? " active" : ""} ${key}`}
          >
            <button
              type="button"
              role="tab"
              id={`terminal-tab-${tab.id}`}
              aria-controls={`terminal-panel-${tab.id}`}
              aria-selected={active}
              title={tab.title}
              tabIndex={active ? 0 : -1}
              onClick={() => activateTerminalTab(tab.id)}
              onKeyDown={onTabKeyDown}
              style={{ display: "flex", alignItems: "center", gap: "var(--sp-8)", flex: "1 1 auto", minWidth: 0, height: "100%", textAlign: "left" }}
            >
              <i className={`dot ${key}`} />
              <span className="tlabel">{tab.title}</span>
            </button>
            <button
              type="button"
              className="tclose"
              aria-label={`Close ${tab.title}`}
              tabIndex={active ? 0 : -1}
              onClick={() => closeTerminalTab(tab.id)}
            >
              <Icon name="ic-close" className="icon xs" />
            </button>
          </div>
        );
        })}
        <button
          type="button"
          className="tab-new"
          aria-label="New terminal tab"
          onClick={() => {
            addTab({ agent: "shell" });
            setWorkspaceView("terminal");
          }}
        >
          <Icon name="ic-plus" size="sm" />
        </button>
      </div>

      <span className="tabbar-divider" />
      <button
        type="button"
        role="tab"
        id="agents-tab"
        aria-controls="agents-panel"
        aria-selected={workspaceView === "agents"}
        tabIndex={workspaceView === "agents" || tabs.length === 0 ? 0 : -1}
        className={`agents-tab${workspaceView === "agents" ? " active" : ""}`}
        onClick={() => setWorkspaceView("agents")}
        onKeyDown={onTabKeyDown}
      >
        <Icon name="ic-roster" size="sm" />
        <span>Agents</span>
        {(needsInputCount > 0 || finishedCount > 0) && (
          <span
            className="agents-tab-states"
            aria-label={`${needsInputCount} need input, ${finishedCount} finished`}
          >
            {needsInputCount > 0 && (
              <span className="agents-tab-state attention">
                <Icon name="ic-alert" className="icon pulse" size="xs" />
                {needsInputCount}
              </span>
            )}
            {finishedCount > 0 && (
              <span className="agents-tab-state finished">
                <Icon name="ic-check" className="icon" size="xs" />
                {finishedCount}
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}
