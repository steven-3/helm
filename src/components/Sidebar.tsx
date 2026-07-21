/* ══════════════════════════════════════════════════════════════════════════
   Sidebar (e1) — the docked left panel. Content follows the active rail view:
   Roster + Files + SCM + Search are all real panels (SCM = live useGit changes;
   "not a git repository" when status is null; Search = project-wide search over
   search_project, wired in SearchView). App gates visibility (renders nothing
   when sidebar===null). When the rail is on Settings (a modal, no docked panel)
   we keep showing the last real panel (useLayout.sidebar = roster|files).
   ══════════════════════════════════════════════════════════════════════════ */
import { useLayout } from "../store/layout";
import { RosterView } from "./RosterView";
import { FilesView } from "./FilesView";
import { ScmView } from "./ScmView";
import { SearchView } from "./SearchView";
import { VoiceHistoryPanel } from "./VoiceHistoryPanel";
import type { RailView } from "../lib/contract";

export function Sidebar() {
  const railView = useLayout((s) => s.railView);
  const sidebar = useLayout((s) => s.sidebar);

  const panels: RailView[] = ["files", "roster", "search", "scm", "voice"];
  const view: RailView = panels.includes(railView) ? railView : sidebar ?? "roster";

  return (
    <aside className="sidebar" aria-label="Sidebar">
      {view === "roster" && <RosterView />}
      {view === "files" && <FilesView />}
      {view === "search" && <SearchView />}
      {view === "scm" && <ScmView />}
      {view === "voice" && <VoiceHistoryPanel />}
    </aside>
  );
}
