/* ══════════════════════════════════════════════════════════════════════════
   Activity Rail (e1) — icon buttons (Files · Roster · Search · SCM · Settings).
   Active view = 2px azure bar (functional accent). The Roster button carries a
   live agent-dot badge (§4.3 glanceable-roster claim); SCM carries a count chip.
   Drives useLayout.setRailView; re-clicking the active Files/Roster collapses the
   sidebar (VS-Code pattern). Settings opens the modal (owned by App).
   ══════════════════════════════════════════════════════════════════════════ */
import { useLayout } from "../store/layout";
import { useRosterCounts } from "../store/roster";
import { Icon, type IconName } from "./icons";
import type { RailView } from "../lib/contract";

const SCM_CHANGES = 3; // stub: no git store yet (P1 roadmap); mirrors the status-bar ±3

export function ActivityRail({
  settingsOpen,
  onOpenSettings,
}: {
  settingsOpen: boolean;
  onOpenSettings: () => void;
}) {
  const railView = useLayout((s) => s.railView);
  const sidebar = useLayout((s) => s.sidebar);
  const setRailView = useLayout((s) => s.setRailView);
  const toggleSidebar = useLayout((s) => s.toggleSidebar);
  const counts = useRosterCounts();

  const onView = (v: RailView) => {
    const backed = v === "files" || v === "roster";
    if (backed && railView === v && sidebar !== null) toggleSidebar();
    else setRailView(v);
  };

  const isActive = (v: RailView) => railView === v && sidebar !== null;

  const Btn = ({
    view,
    icon,
    label,
    children,
  }: {
    view: RailView;
    icon: IconName;
    label: string;
    children?: React.ReactNode;
  }) => (
    <button
      className={`rail-btn${isActive(view) ? " active" : ""}`}
      aria-label={label}
      aria-pressed={isActive(view)}
      onClick={() => onView(view)}
    >
      <Icon name={icon} />
      {children}
    </button>
  );

  return (
    <nav className="rail" aria-label="Activity">
      <Btn view="files" icon="ic-files" label="Files" />
      <Btn view="roster" icon="ic-roster" label={`Roster (${counts.total} sessions)`}>
        <span className="rail-badge">
          {counts.claude > 0 && <i className="dot cl" />}
          {counts.codex > 0 && <i className="dot cx" />}
          {counts.claude === 0 && counts.codex === 0 && counts.shell > 0 && <i className="dot gn" />}
        </span>
      </Btn>
      <Btn view="search" icon="ic-search" label="Search" />
      <Btn view="scm" icon="ic-branch" label={`Source control (${SCM_CHANGES} changes)`}>
        <span className="rail-count tnum">{SCM_CHANGES}</span>
      </Btn>

      <div className="rail-spacer" />

      <button
        className={`rail-btn${settingsOpen ? " active" : ""}`}
        aria-label="Settings"
        aria-pressed={settingsOpen}
        onClick={onOpenSettings}
      >
        <Icon name="ic-settings" />
      </button>
    </nav>
  );
}
