/* ══════════════════════════════════════════════════════════════════════════
   TabBar — persisted workspace tabs with inline rename, drag reorder, and a
   safety-visible per-tab broadcast input toggle for split terminals.
   ══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { TAB_ACCENT_SLOTS, usePanes, type TabAccent } from "../store/panes";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import { useLayout } from "../store/layout";
import "../styles/wiring.css";

type DropSide = "before" | "after";

export function TabBar() {
  const tabListRef = useRef<HTMLDivElement>(null);
  const cancelRenameRef = useRef(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tabId: string; side: DropSide } | null>(null);
  const [colorMenuTabId, setColorMenuTabId] = useState<string | null>(null);
  const tabs = usePanes((s) => s.tabs);
  const panes = usePanes((s) => s.panes);
  const activeTabId = usePanes((s) => s.activeTabId);
  const broadcastTabs = usePanes((s) => s.broadcastTabs);
  const setActiveTab = usePanes((s) => s.setActiveTab);
  const closeTab = usePanes((s) => s.closeTab);
  const addTab = usePanes((s) => s.addTab);
  const renameTab = usePanes((s) => s.renameTab);
  const moveTab = usePanes((s) => s.moveTab);
  const setTabColor = usePanes((s) => s.setTabColor);
  const toggleTabBroadcast = usePanes((s) => s.toggleTabBroadcast);
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

  const beginRename = (tabId: string, title: string) => {
    cancelRenameRef.current = false;
    setEditingTabId(tabId);
    setRenameDraft(title);
  };

  const finishRename = (tabId: string) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
    } else {
      renameTab(tabId, renameDraft);
    }
    setEditingTabId(null);
  };

  const clearDrag = () => {
    setDraggedTabId(null);
    setDropTarget(null);
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>, tabId: string) => {
    const target = event.target as HTMLElement;
    if (target.closest(".tclose,.tbroadcast,.tab-title-input")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/helm-tab", tabId);
    setDraggedTabId(tabId);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>, tabId: string) => {
    if (!draggedTabId || draggedTabId === tabId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const side: DropSide = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    setDropTarget({ tabId, side });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>, tabId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/helm-tab") || draggedTabId;
    const from = tabs.findIndex((tab) => tab.id === sourceId);
    const targetIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (from >= 0 && targetIndex >= 0 && from !== targetIndex) {
      let insertionIndex = targetIndex + (dropTarget?.tabId === tabId && dropTarget.side === "after" ? 1 : 0);
      if (from < insertionIndex) insertionIndex--;
      moveTab(from, Math.max(0, Math.min(tabs.length - 1, insertionIndex)));
    }
    clearDrag();
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Workspace tabs" ref={tabListRef}>
      <div className="terminal-tabs" role="presentation">
        {tabs.map((tab) => {
          const active = workspaceView === "terminal" && tab.id === activeTabId;
          const pane = panes[tab.activePaneId];
          const key = pane ? agentVis(pane.agent).key : "gn";
          const broadcast = broadcastTabs[tab.id] === true;
          const dropClass = dropTarget?.tabId === tab.id ? ` drag-${dropTarget.side}` : "";
          return (
            <div
              key={tab.id}
              role="presentation"
              className={`tab${active ? " active" : ""} ${key}${dropClass}${draggedTabId === tab.id ? " dragging" : ""}`}
              draggable={editingTabId !== tab.id}
              onDragStart={(event) => onDragStart(event, tab.id)}
              onDragOver={(event) => onDragOver(event, tab.id)}
              onDrop={(event) => onDrop(event, tab.id)}
              onDragEnd={clearDrag}
              data-tab-color={tab.color ?? "slate"}
              onContextMenu={(event) => {
                event.preventDefault();
                setColorMenuTabId(tab.id);
              }}
            >
              <button
                type="button"
                className="tab-color-trigger"
                aria-label={`Choose color for ${tab.title}`}
                tabIndex={active ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  setColorMenuTabId((current) => current === tab.id ? null : tab.id);
                }}
              >
                <i className="tab-color-dot" />
              </button>
              {editingTabId === tab.id ? (
                <input
                  className="tab-title-input"
                  value={renameDraft}
                  aria-label={`Rename ${tab.title}`}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => finishRename(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRenameRef.current = true;
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  id={`terminal-tab-${tab.id}`}
                  aria-controls={`terminal-panel-${tab.id}`}
                  aria-selected={active}
                  title={`${tab.title} · double-click to rename`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => activateTerminalTab(tab.id)}
                  onDoubleClick={() => beginRename(tab.id, tab.title)}
                  onKeyDown={onTabKeyDown}
                  style={{ display: "flex", alignItems: "center", gap: "var(--sp-8)", flex: "1 1 auto", minWidth: 0, height: "100%", textAlign: "left" }}
                >
                  <i className={`dot ${key}`} />
                  <span className="tlabel">{tab.title}</span>
                </button>
              )}
              {colorMenuTabId === tab.id && (
                <div className="tab-color-popover" role="menu" aria-label={`Colors for ${tab.title}`} onClick={(event) => event.stopPropagation()}>
                  {TAB_ACCENT_SLOTS.map((color: TabAccent) => (
                    <button
                      key={color}
                      type="button"
                      role="menuitemradio"
                      aria-label={color}
                      aria-checked={tab.color === color}
                      aria-pressed={tab.color === color}
                      data-color={color}
                      onClick={() => {
                        setTabColor(tab.id, color);
                        setColorMenuTabId(null);
                      }}
                    />
                  ))}
                </div>
              )}
              {tab.paneIds.length > 1 && (
                <button
                  type="button"
                  className={`tbroadcast${broadcast ? " active" : ""}`}
                  aria-label={`${broadcast ? "Disable" : "Enable"} broadcast input for ${tab.title}`}
                  aria-pressed={broadcast}
                  title={`${broadcast ? "Disable" : "Enable"} broadcast input to all panes in this tab`}
                  tabIndex={active ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    activateTerminalTab(tab.id);
                    toggleTabBroadcast(tab.id);
                  }}
                >
                  <Icon name="ic-broadcast" className="icon xs" />
                </button>
              )}
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
