/* ══════════════════════════════════════════════════════════════════════════
   FleetHome (U1 · §7.1) — the new default surface. With up to 16 concurrent
   sessions the scarce resource is the operator's attention, so the home screen
   is the whole operation at a glance, not a terminal grid:

     · a GRID of session cards — one per pane, seat-color edge (§13.3), the live
       run/idle/error state (§4.5), and an embedded Flight-Recorder DigestCard
       (§4.9) whose window opens at the last time you looked at that session
       (tracked in the layout store).
     · a BOARD summary strip — the four column counts, click → the Board surface.
     · a MEMORY recency line — the most-recently-written shared note.
     · a PROJECTS section (v0.5) — "Open Folder…" runs the native dialog through
       the shared commands.ts flow (explorer root + recent-projects record +
       Files surface reveal); below it, settings.recentProjects renders as a
       dense recents list (name strong, full path dim mono, click reopens). This
       surfaces the previously-undiscoverable explorer-root flow.
     · an UPDATE pill — surfaced from the updater state.
     · a GET-TO-WORK launcher (§7.1) — the fresh-workspace path: pick a layout →
       browse a project → point the seats at models. It IS the empty state; on a
       busy fleet it recedes to a quiet strip under the grid.

   Product surface → quiet tier, tokens only, motion gated to state changes. The
   DigestCard shimmer is the sanctioned loading exception. Reads the stores;
   the only prop is the App-owned Settings opener.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef } from "react";
import { usePanes } from "../store/panes";
import { useLayout } from "../store/layout";
import { useModelHub } from "../store/modelhub";
import { useBoard } from "../store/board";
import { useMemory } from "../store/memory";
import { useRecorder } from "../store/recorder";
import { useUpdater } from "../store/updater";
import { useExplorer } from "../store/explorer";
import { useEnv } from "../store/env";
import { useSettings } from "../store/settings";
import { revealPane } from "../lib/dispatch";
import { openProjectFolderDialog, revealProjectInFiles } from "../lib/commands";
import { seatHueFor, STATUS_WORD } from "./BoardCard";
import { agentVis, stateVis } from "./agent-view";
import { DigestCard } from "./DigestCard";
import { Icon } from "./icons";
import type { SettingsSection } from "./Settings";
import type { Pane } from "../lib/contract";
import "../styles/fleet.css";

/** The canonical project-root derivation shared across the .helm surfaces:
    an explicit explorer root, else the active pane's cwd, else the env home. */
function projectRoot(): string | null {
  const panes = usePanes.getState();
  const tab = panes.tabs.find((t) => t.id === panes.activeTabId);
  return (
    useExplorer.getState().root ??
    (tab ? panes.panes[tab.activePaneId]?.cwd ?? null : null) ??
    useEnv.getState().cwd ??
    null
  );
}

function relTime(ts: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Last path segment, separator-agnostic (POSIX "/" and Windows "\") — the
    project name shown strong in the recents list. */
function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const name = idx < 0 ? trimmed : trimmed.slice(idx + 1);
  return name || trimmed || path;
}

/** How many recent projects the section renders (the store keeps the full cap). */
const RECENTS_SHOWN = 8;

function SessionCard({ pane, sinceTs, onOpen }: { pane: Pane; sinceTs: number; onOpen: (id: string) => void }) {
  const seats = useModelHub((s) => s.seats);
  const vis = agentVis(pane.agent, pane.command);
  const sv = stateVis(pane.state, vis.key);
  const hue = seatHueFor(pane.model ?? pane.agent, seats);

  return (
    <article className="fleet-session" data-seat={hue} aria-label={`Session ${pane.title}`}>
      <span className="fleet-session-edge" aria-hidden="true" />
      <button className="fleet-session-head" onClick={() => onOpen(pane.id)} title={`Open ${pane.title}`}>
        <span className="fleet-session-id">
          <i className="seat-dot" aria-hidden="true" />
          <Icon name={vis.glyph} size="sm" className={`icon fleet-glyph ${vis.key}`} />
          <span className="seat-label fleet-session-word">{vis.word}</span>
        </span>
        <span className={`fleet-state ${sv.cls}${sv.pulse ? " pulse" : ""}`}>
          {sv.kind === "dot" ? (
            <i className={`dot ${sv.dot}`} aria-hidden="true" />
          ) : (
            <Icon name={sv.icon!} size="xs" className="icon" />
          )}
          <span>{sv.word}</span>
        </span>
      </button>
      <DigestCard sessionId={pane.id} sinceTs={sinceTs} />
    </article>
  );
}

function GetToWork({
  variant,
  onTemplates,
  onBrowse,
  onSeats,
}: {
  variant: "hero" | "strip";
  onTemplates: () => void;
  onBrowse: () => void;
  onSeats: () => void;
}) {
  return (
    <section className={`fleet-start fleet-start-${variant}`} aria-label="Get to work">
      {variant === "hero" && (
        <div className="fleet-start-lede">
          <Icon name="ic-helm" className="icon fleet-start-mark" />
          <h2 className="fleet-start-title">Start the operation</h2>
          <p className="fleet-start-copy">Pick a workspace layout, open a project, and point the seats at your models.</p>
        </div>
      )}
      <div className="fleet-start-actions">
        <button className="fleet-start-btn primary" onClick={onTemplates}>
          <Icon name="ic-split" size="sm" className="icon" />
          <span>New workspace layout</span>
        </button>
        <button className="fleet-start-btn" onClick={onBrowse}>
          <Icon name="ic-folder-open" size="sm" className="icon" />
          <span>Open a project</span>
        </button>
        <button className="fleet-start-btn" onClick={onSeats}>
          <Icon name="ic-settings" size="sm" className="icon" />
          <span>Configure model seats</span>
        </button>
      </div>
    </section>
  );
}

export function FleetHome({ onOpenSettings }: { onOpenSettings: (section: SettingsSection) => void }) {
  const panes = usePanes((s) => s.panes);
  const activeTabId = usePanes((s) => s.activeTabId);
  const setWorkspaceView = useLayout((s) => s.setWorkspaceView);
  const sessionSeenTs = useLayout((s) => s.sessionSeenTs);
  const markSessionSeen = useLayout((s) => s.markSessionSeen);
  const openModal = useLayout((s) => s.openModal);

  const columns = useBoard((s) => s.columns);
  const boardLoaded = useBoard((s) => s.loaded);
  const memory = useMemory((s) => s.index);

  const updState = useUpdater((s) => s.state);
  const updVersion = useUpdater((s) => s.version);
  const updInstall = useUpdater((s) => s.install);

  const recentProjects = useSettings((s) => s.recentProjects);

  const sessions = useMemo(() => Object.values(panes), [panes]);
  // Unseen sessions default their digest window to first arrival at Fleet Home,
  // so the "since you looked away" timestamp reads cleanly ("just now") instead
  // of an epoch-distance nonsense; seen sessions carry their real last-look ts.
  const mountTs = useRef(Date.now());

  // Board + Memory summaries need their .helm stores loaded; they self-load when
  // their surfaces open, but the Fleet strips show BEFORE that, so prime them.
  useEffect(() => {
    const root = projectRoot();
    if (!root) return;
    if (!useBoard.getState().loaded) void useBoard.getState().load(root);
    if (!useMemory.getState().loaded) void useMemory.getState().load(root);
    // Prime the Flight Recorder root so the embedded digests have a store to read.
    if (!useRecorder.getState().root) useRecorder.getState().setRoot(root);
  }, []);

  // Arriving at Fleet Home means you've stopped looking at whatever session was
  // focused — bump its window origin so its next digest is "since you left".
  useEffect(() => {
    const tab = usePanes.getState().tabs.find((t) => t.id === activeTabId);
    if (tab?.activePaneId) markSessionSeen(tab.activePaneId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSession = (id: string) => {
    markSessionSeen(id);
    setWorkspaceView("terminal");
    revealPane(id);
  };

  const browseProject = () => {
    void openProjectFolderDialog().then((opened) => {
      if (opened) return;
      // Dialog cancelled or unavailable (browser dev): fall back to revealing
      // the Files surface, the pre-dialog browse behavior.
      const l = useLayout.getState();
      l.setWorkspaceView("terminal");
      l.setRailView("files");
      if (l.sidebar === null) l.setSidebar("files");
    });
  };

  const now = Date.now();
  const latest = memory[0];
  const totalCards = boardLoaded ? columns.reduce((n, c) => n + c.cardIds.length, 0) : 0;
  const fresh = sessions.length <= 1 && totalCards === 0 && memory.length === 0;
  const recents = (recentProjects ?? []).slice(0, RECENTS_SHOWN);

  return (
    <div className="fleet" role="region" aria-label="Fleet Home">
      <header className="fleet-head">
        <div className="fleet-head-main">
          <h1 className="fleet-title">Fleet</h1>
          <span className="fleet-sub tnum">
            {sessions.length} active {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>

        {updState === "ready" && (
          <div className="fleet-update ready" role="status">
            <span className="fleet-update-txt">
              Update ready{updVersion ? ` · v${updVersion}` : ""}
            </span>
            <button className="fleet-update-btn" onClick={() => void updInstall()}>
              <Icon name="ic-play" size="xs" className="icon" />
              Restart
            </button>
          </div>
        )}
        {updState === "available" && (
          <button className="fleet-update available" onClick={() => onOpenSettings("updates")}>
            <Icon name="ic-info" size="xs" className="icon" />
            Update available{updVersion ? ` · v${updVersion}` : ""}
          </button>
        )}
        {updState === "downloading" && (
          <span className="fleet-update downloading" role="status">Downloading update…</span>
        )}
      </header>

      <div className="fleet-strips">
        <button
          className="fleet-board"
          onClick={() => setWorkspaceView("board")}
          aria-label="Open Board"
        >
          <span className="fleet-strip-label">Board</span>
          <span className="fleet-board-cols">
            {(boardLoaded ? columns : []).map((col) => (
              <span className="fleet-board-col" key={col.id}>
                <span className="fleet-board-n tnum">{col.cardIds.length}</span>
                <span className="fleet-board-l">{STATUS_WORD[col.id]}</span>
              </span>
            ))}
            {!boardLoaded && <span className="fleet-strip-empty">not loaded</span>}
          </span>
        </button>

        <button
          className="fleet-memory"
          onClick={() => setWorkspaceView("memory")}
          aria-label="Open Memory"
        >
          <span className="fleet-strip-label">Memory</span>
          {latest ? (
            <span className="fleet-memory-line">
              <span className="fleet-memory-name">{latest.name}</span>
              <span className="fleet-memory-meta tnum">
                {relTime(Date.parse(latest.updated) || now, now)} · {memory.length}{" "}
                {memory.length === 1 ? "note" : "notes"}
              </span>
            </span>
          ) : (
            <span className="fleet-strip-empty">No shared memory yet</span>
          )}
        </button>
      </div>

      <section className="fleet-projects" aria-label="Projects">
        <div className="fleet-projects-head">
          <span className="fleet-strip-label">Projects</span>
          <button className="fleet-projects-open" onClick={browseProject}>
            <Icon name="ic-folder-open" size="sm" className="icon" />
            <span>Open Folder…</span>
          </button>
        </div>
        {recents.length === 0 ? (
          <p className="fleet-projects-empty">No recent projects yet — open a folder and it lands here.</p>
        ) : (
          <ul className="fleet-projects-list">
            {recents.map((path) => (
              <li key={path}>
                <button
                  className="fleet-project-row"
                  onClick={() => void revealProjectInFiles(path)}
                  title={path}
                >
                  <Icon name="ic-folder" size="sm" className="icon" />
                  <span className="fleet-project-name">{baseName(path)}</span>
                  <span className="fleet-project-path">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sessions.length === 0 ? (
        <GetToWork variant="hero" onTemplates={() => openModal("templates")} onBrowse={browseProject} onSeats={() => onOpenSettings("models")} />
      ) : (
        <>
          <div className="fleet-grid">
            {sessions.map((pane) => (
              <SessionCard
                key={pane.id}
                pane={pane}
                sinceTs={sessionSeenTs[pane.id] ?? mountTs.current}
                onOpen={openSession}
              />
            ))}
          </div>
          {fresh && (
            <GetToWork variant="strip" onTemplates={() => openModal("templates")} onBrowse={browseProject} onSeats={() => onOpenSettings("models")} />
          )}
        </>
      )}
    </div>
  );
}
