/* ══════════════════════════════════════════════════════════════════════════
   Activity Rail (U1 · Mission Control) — the icon column that reorients the app
   around the fleet, not the terminal grid.

   Two zones + a bottom cluster:
     · SURFACES (radio over workspaceView): Fleet Home · Terminals · Board ·
       Swarm · Memory — the center destinations. Terminals carries the live
       agent-dot roster badge (the glanceable-roster claim, §4.3).
     · PANELS (docked sidebar, over the terminal workspace): Files · Search ·
       SCM — re-click collapses (VS Code pattern); SCM carries the live change
       count from useGit.
     · BOTTOM: Attention inbox toggle (live queue-length badge, §4.7) · Voice
       push-to-talk (pastes to the focused pane) · an update-ready pill (only
       when useUpdater is "ready") · Settings (modal, owned by App).

   Every surface ALSO routes through registerSurfaceHandler (App) so palette /
   omnibar / shortcut all reach the same views — the rail is one entry, not the
   source of truth. Pure UI: reads the stores, writes intent.
   ══════════════════════════════════════════════════════════════════════════ */
import { useLayout, type WorkspaceView } from "../store/layout";
import { useRosterCounts } from "../store/roster";
import { useGit } from "../store/git";
import { useAttention } from "../store/attention";
import { useUpdater } from "../store/updater";
import { VoiceButton } from "./VoiceButton";
import { Icon, type IconName } from "./icons";
import type { RailView } from "../lib/contract";

export function ActivityRail({
  settingsOpen,
  onOpenSettings,
  onOpenUpdates,
}: {
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onOpenUpdates: () => void;
}) {
  const railView = useLayout((s) => s.railView);
  const sidebar = useLayout((s) => s.sidebar);
  const workspaceView = useLayout((s) => s.workspaceView);
  const setWorkspaceView = useLayout((s) => s.setWorkspaceView);
  const attentionOpen = useLayout((s) => s.attentionOpen);
  const toggleAttention = useLayout((s) => s.toggleAttention);

  const counts = useRosterCounts();
  const changes = useGit((s) => s.status?.changes.length ?? 0);
  const asks = useAttention((s) => s.queue.length);
  const updateReady = useUpdater((s) => s.state === "ready");

  // Panel buttons open a docked sidebar over the terminal workspace, so they
  // always return you to it; re-click collapses. (setRailView opens the sidebar
  // itself only for files/roster, so search/scm get an explicit reveal.)
  const goPanel = (v: RailView) => {
    const wasTerminal = workspaceView === "terminal";
    setWorkspaceView("terminal");
    const l = useLayout.getState();
    if (wasTerminal && l.railView === v && l.sidebar !== null) {
      l.toggleSidebar();
      return;
    }
    l.setRailView(v);
    if (useLayout.getState().sidebar === null) l.setSidebar(v === "files" ? "files" : "roster");
  };
  const panelActive = (v: RailView) =>
    workspaceView === "terminal" && railView === v && sidebar !== null;

  const Surface = ({
    view,
    icon,
    label,
    children,
  }: {
    view: WorkspaceView;
    icon: IconName;
    label: string;
    children?: React.ReactNode;
  }) => (
    <button
      className={`rail-btn${workspaceView === view ? " active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={workspaceView === view}
      onClick={() => setWorkspaceView(view)}
    >
      <Icon name={icon} />
      {children}
    </button>
  );

  const Panel = ({
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
      className={`rail-btn${panelActive(view) ? " active" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={panelActive(view)}
      onClick={() => goPanel(view)}
    >
      <Icon name={icon} />
      {children}
    </button>
  );

  return (
    <nav className="rail" aria-label="Activity">
      <Surface view="fleet" icon="ic-home" label="Fleet Home" />
      <Surface view="terminal" icon="ic-shell" label={`Terminals (${counts.total} sessions)`}>
        <span className="rail-badge">
          {counts.claude > 0 && <i className="dot cl" />}
          {counts.codex > 0 && <i className="dot cx" />}
          {counts.claude === 0 && counts.codex === 0 && counts.shell > 0 && <i className="dot gn" />}
        </span>
      </Surface>
      <Surface view="board" icon="ic-table" label="Board" />
      <Surface view="swarm" icon="ic-broadcast" label="Swarm" />
      <Surface view="memory" icon="ic-markdown" label="Memory" />

      <div className="rail-sep" aria-hidden="true" />

      <Panel view="files" icon="ic-files" label="Files" />
      <Panel view="search" icon="ic-search" label="Search" />
      <Panel view="scm" icon="ic-branch" label={`Source control (${changes} changes)`}>
        {changes > 0 && <span className="rail-count tnum">{changes}</span>}
      </Panel>

      <div className="rail-spacer" />

      <button
        className={`rail-btn${attentionOpen ? " active" : ""}`}
        aria-label={`Attention inbox (${asks} pending)`}
        title={`Attention inbox (${asks} pending)`}
        aria-pressed={attentionOpen}
        onClick={() => toggleAttention()}
      >
        <Icon name="ic-bell" />
        {asks > 0 && <span className="rail-count attn tnum">{asks > 99 ? "99+" : asks}</span>}
      </button>

      <div className="rail-voice">
        <VoiceButton size="sm" showTimer={false} />
      </div>

      {updateReady && (
        <button
          className="rail-btn rail-update"
          aria-label="Update ready — restart to install"
          title="Update ready — restart to install"
          onClick={onOpenUpdates}
        >
          <Icon name="ic-play" />
          <span className="rail-dot" aria-hidden="true" />
        </button>
      )}

      <button
        className={`rail-btn${settingsOpen ? " active" : ""}`}
        aria-label="Settings"
        title="Settings"
        aria-pressed={settingsOpen}
        onClick={onOpenSettings}
      >
        <Icon name="ic-settings" />
      </button>
    </nav>
  );
}
