/* ══════════════════════════════════════════════════════════════════════════
   Sidebar (e1) — the docked left panel. Content follows the active rail view:
   Roster + Files + SCM are real panels (SCM = live useGit changes; "not a git
   repository" when status is null); Search is an honest P1 stub so the rail
   click is never dead. App gates visibility (renders nothing when sidebar===null).
   When the rail is on Settings (a modal, no docked panel) we keep showing the
   last real panel (useLayout.sidebar = roster|files).
   ══════════════════════════════════════════════════════════════════════════ */
import { useLayout } from "../store/layout";
import { useGit } from "../store/git";
import { RosterView } from "./RosterView";
import { FilesView } from "./FilesView";
import { Icon } from "./icons";
import type { RailView } from "../lib/contract";

function SearchStub() {
  return (
    <>
      <div className="side-head"><span className="side-title">Search</span></div>
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

function ScmView() {
  const status = useGit((s) => s.status);
  return (
    <>
      <div className="side-head">
        <span className="side-title">Source control</span>
        {status && <span className="side-count tnum">{status.changes.length}</span>}
      </div>
      <div className="side-sep" />
      <div className="stub">
        {status === null ? (
          <div className="stub-hint">not a git repository</div>
        ) : (
          status.changes.map((c) => (
            <div className="scm-row" key={c.path}>
              <span className={`scm-badge ${c.code.includes("?") ? "new" : "mod"}`}>{c.code.trim()}</span>
              <span className="scm-name">{c.path}</span>
            </div>
          ))
        )}
        <div className="stub-hint">Staging + commit land in P1.</div>
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
      {view === "scm" && <ScmView />}
    </aside>
  );
}
