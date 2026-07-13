/* ══════════════════════════════════════════════════════════════════════════
   StatusBar (e1, §6 micro row) — every segment is REAL or absent. Left: WSL
   distro (useEnv), branch ±ahead/behind + change count (useGit — omitted when
   not a repo), active pane cwd. Right: agent counts/running, pane count, the
   active pane's model ?? command, and a live clock (data, not motion).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { usePanes } from "../store/panes";
import { useRosterCounts } from "../store/roster";
import { useEnv } from "../store/env";
import { useGit } from "../store/git";
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

  const [clock, setClock] = useState(clockNow);
  useEffect(() => {
    const id = window.setInterval(() => setClock(clockNow()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <footer className="statusbar">
      <div className="st-group">
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
      </div>
    </footer>
  );
}
