/* ══════════════════════════════════════════════════════════════════════════
   TabBar (e1) — tabs from usePanes. Active tab = surface-base (continuous with
   the terminal well below) + a top agent-colour identity strip drawn from its
   active pane; inactive = surface-panel + secondary text. Close → closeTab; the
   + button → addTab (a fresh shell session).
   ══════════════════════════════════════════════════════════════════════════ */
import { usePanes } from "../store/panes";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";

export function TabBar() {
  const tabs = usePanes((s) => s.tabs);
  const panes = usePanes((s) => s.panes);
  const activeTabId = usePanes((s) => s.activeTabId);
  const setActiveTab = usePanes((s) => s.setActiveTab);
  const closeTab = usePanes((s) => s.closeTab);
  const addTab = usePanes((s) => s.addTab);

  return (
    <div className="tabbar" role="tablist" aria-label="Terminal tabs">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const pane = panes[tab.activePaneId];
        const key = pane ? agentVis(pane.agent).key : "gn";
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            className={`tab${active ? " active" : ""} ${key}`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveTab(tab.id);
              }
            }}
          >
            <i className={`dot ${key}`} />
            <span className="tlabel">{tab.title}</span>
            <button
              className="tclose"
              aria-label={`Close ${tab.title}`}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            >
              <Icon name="ic-close" className="icon xs" />
            </button>
          </div>
        );
      })}
      <button
        className="tab-new"
        aria-label="New tab"
        onClick={() => addTab({ agent: "shell", model: "bash", title: "shell", tabTitle: "shell", command: "bash" })}
      >
        <Icon name="ic-plus" size="sm" />
      </button>
    </div>
  );
}
