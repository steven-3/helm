/* ══════════════════════════════════════════════════════════════════════════
   StatusBar (e1, §6 micro row) — WSL/branch/cwd/changes on the left; agent
   counts, pane count, active model, encoding and a live clock on the right. All
   mono + tabular. WSL/branch/encoding are static v1 stubs (no env/git store yet);
   cwd/model/panes/counts read the live stores. The clock ticks (data, not motion).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { usePanes } from "../store/panes";
import { useRosterCounts } from "../store/roster";
import { Icon } from "./icons";

const SCM_CHANGES = 3; // stub — mirrors the rail + SCM view (P1 git store)

function clockNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StatusBar() {
  const counts = useRosterCounts();
  const cwd = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return (t && s.panes[t.activePaneId]?.cwd) || "~/dev/helm";
  });
  const model = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return (t && s.panes[t.activePaneId]?.model) || "shell";
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
        <span className="st-seg"><Icon name="ic-shell" />WSL2 · Ubuntu-22.04</span>
        <span className="st-seg"><Icon name="ic-branch" /><span className="st-strong">main</span> ↑1</span>
        <span className="st-seg">{cwd}</span>
        <span className="st-seg">± {SCM_CHANGES}</span>
      </div>
      <div className="st-group">
        <span className="st-seg">
          <i className="dot cl" />{counts.claude} <i className="dot cx" />{counts.codex}
          <span className="st-mute">running {counts.running}</span>
        </span>
        <span className="st-seg"><Icon name="ic-split" />{paneCount} panes</span>
        <span className="st-seg st-strong">{model}</span>
        <span className="st-seg">UTF-8 · LF</span>
        <span className="st-seg st-strong">{clock}</span>
      </div>
    </footer>
  );
}
