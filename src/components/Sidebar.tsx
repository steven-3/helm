/* ══════════════════════════════════════════════════════════════════════════
   Sidebar (e1) — the docked left panel. Content follows the active rail view:
   Roster + Files are the v1 panels; Search + SCM are tasteful P1 stubs so a rail
   click is never dead. App gates visibility (renders nothing when sidebar===null).
   When the rail is on Settings (a modal, no docked panel) we keep showing the
   last real panel (useLayout.sidebar = roster|files).
   ══════════════════════════════════════════════════════════════════════════ */
import { useLayout } from "../store/layout";
import { RosterView } from "./RosterView";
import { FilesView } from "./FilesView";
import { Icon } from "./icons";
import type { RailView } from "../lib/contract";

function SearchStub() {
  return (
    <>
      <div className="side-head"><span className="side-title">SEARCH</span></div>
      <div className="side-sep" />
      <div className="stub">
        <div className="search-field">
          <Icon name="ic-search" className="icon sm" />
          <input placeholder="Search in files…" aria-label="Search in files" />
        </div>
        <div className="stub-hint">Project-wide search arrives in P1. Type to scope a query.</div>
      </div>
    </>
  );
}

function ScmStub() {
  return (
    <>
      <div className="side-head">
        <span className="side-title">SOURCE CONTROL</span>
        <span className="side-count tnum">3</span>
      </div>
      <div className="side-sep" />
      <div className="stub">
        <div className="scm-row"><span className="scm-badge mod">M</span><span className="scm-name">src-tauri/src/pty.rs</span></div>
        <div className="scm-row"><span className="scm-badge mod">M</span><span className="scm-name">src/components/Stage.tsx</span></div>
        <div className="scm-row"><span className="scm-badge new">?</span><span className="scm-name">mockup/cockpit.html</span></div>
        <div className="stub-hint">Staging + commit land in P1 (real git store).</div>
      </div>
    </>
  );
}

export function Sidebar() {
  const railView = useLayout((s) => s.railView);
  const sidebar = useLayout((s) => s.sidebar);

  const panels: RailView[] = ["files", "roster", "search", "scm"];
  const view: RailView = panels.includes(railView) ? railView : sidebar ?? "roster";

  return (
    <aside className="sidebar" aria-label="Sidebar">
      {view === "roster" && <RosterView />}
      {view === "files" && <FilesView />}
      {view === "search" && <SearchStub />}
      {view === "scm" && <ScmStub />}
    </aside>
  );
}
