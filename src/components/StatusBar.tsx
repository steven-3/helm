/* ══════════════════════════════════════════════════════════════════════════
   StatusBar (e1, §6 micro row) — every segment is REAL or absent. Left: the
   broadcast-input control (a control, not a readout, so it leads the group),
   then WSL distro (useEnv), branch ±ahead/behind + change count (useGit —
   omitted when not a repo), active pane cwd. Right: agent counts/running, pane
   count, the active pane's model ?? command, a live clock, and the Activity
   bell (v3.1) with its unread badge. The bell lives here, not the titlebar:
   the status bar is the glanceable-state zone (VS Code's bell sits bottom-right
   too), and the titlebar's right cluster is a drag region next to the window
   controls where an extra button would fight window dragging.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { usePanes } from "../store/panes";
import { useRosterCounts } from "../store/roster";
import { useEnv } from "../store/env";
import { useGit } from "../store/git";
import { useNotifications } from "../store/notifications";
import { getShortcutById, formatKeys } from "../lib/shortcuts";
import { Icon } from "./icons";

function clockNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StatusBar() {
  const counts = useRosterCounts();
  const wslDistro = useEnv((s) => s.wslDistro);
  const git = useGit((s) => s.status);
  const cwd = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return (t && s.panes[t.activePaneId]?.cwd) || null;
  });
  const modelOrCommand = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    const p = t ? s.panes[t.activePaneId] : undefined;
    return p ? p.model ?? p.command : null;
  });
  const paneCount = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return t ? t.paneIds.length : 0;
  });
  const broadcastEnabled = usePanes((s) => s.broadcastEnabled);
  const toggleBroadcast = usePanes((s) => s.toggleBroadcast);
  const unreadCount = useNotifications((s) => s.unreadCount);
  const panelOpen = useNotifications((s) => s.panelOpen);
  const togglePanel = useNotifications((s) => s.togglePanel);

  const [clock, setClock] = useState(clockNow);
  useEffect(() => {
    const id = window.setInterval(() => setClock(clockNow()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const broadcastEligible = paneCount >= 2;
  const broadcastKeys = formatKeys(getShortcutById("tab.broadcast")?.keys ?? "mod+alt+b");

  return (
    <footer className="statusbar">
      <div className="st-group">
        <button
          type="button"
          className={`st-seg btn st-bcast${broadcastEnabled ? " on" : ""}`}
          aria-pressed={broadcastEnabled}
          disabled={!broadcastEligible}
          title={broadcastEligible
            ? `Broadcast input to all panes in tab (${broadcastKeys})`
            : "Split this tab to broadcast input"}
          onClick={toggleBroadcast}
        >
          <Icon name="ic-broadcast" />Broadcast
        </button>
        {wslDistro && (
          <span className="st-seg st-env"><Icon name="ic-shell" />WSL2 · {wslDistro}</span>
        )}
        {git?.branch && (
          <span className="st-seg st-git">
            <Icon name="ic-branch" /><span className="st-strong st-value">{git.branch}</span>
            {git.ahead != null && git.ahead > 0 && ` ↑${git.ahead}`}
            {git.behind != null && git.behind > 0 && ` ↓${git.behind}`}
          </span>
        )}
        {cwd && <span className="st-seg st-dynamic st-cwd" title={cwd}><span className="st-value">{cwd}</span></span>}
        {git && <span className="st-seg">± {git.changes.length}</span>}
      </div>
      <div className="st-group">
        <span className="st-seg st-counts">
          <i className="dot cl" />{counts.claude} <i className="dot cx" />{counts.codex}
          <span className="st-mute">running {counts.running}</span>
        </span>
        <span className="st-seg st-panes"><Icon name="ic-split" />{paneCount} panes</span>
        {modelOrCommand && <span className="st-seg st-strong st-dynamic st-command" title={modelOrCommand}><span className="st-value">{modelOrCommand}</span></span>}
        <span className="st-seg st-strong st-clock">{clock}</span>
        <button
          type="button"
          className="st-seg btn st-bell"
          aria-label={unreadCount > 0 ? `Activity, ${unreadCount} unread` : "Activity"}
          aria-expanded={panelOpen}
          title="Activity"
          onClick={togglePanel}
        >
          <Icon name="ic-bell" />
          {unreadCount > 0 && (
            <span className="st-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
          )}
        </button>
      </div>
    </footer>
  );
}
