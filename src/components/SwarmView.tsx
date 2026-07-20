/* ══════════════════════════════════════════════════════════════════════════
   SwarmView — the mission orchestration surface (§4.5 + §7.2).

   Full-bleed center panel on the void base (mounted by the shell). Two modes:
     · no active mission → the COMPOSER: a brief + role chips (coordinator /
       builder×N / scout / reviewer) + a worktrees toggle → useSwarm.startMission.
     · active mission → the live MissionTree (role nodes, seat-color edges,
       status glyphs; click a role → focus its pane) + a bottom command bar:
       an @-target dropdown (one role / all) + input → useSwarm.sendTo, and Abort
       (two-step confirm) → useSwarm.abort.
   Project root: explorer override ?? active pane cwd (the FilesView pattern the
   board uses); bound into the swarm store via setRoot. Matte throughout — the
   swarm surface itself is never glass (§13.2); only transient popovers qualify.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { m } from "motion/react";
import { useSwarm, type SwarmRoleSpec } from "../store/swarm";
import { useExplorer } from "../store/explorer";
import { usePanes } from "../store/panes";
import { revealPane } from "../lib/dispatch";
import { pressTap } from "../lib/motion";
import { MissionTree } from "./MissionTree";
import { Icon } from "./icons";
import "../styles/swarm.css";

const MAX_BUILDERS = 8;

interface RoleSel {
  coordinator: boolean;
  builders: number;
  scout: boolean;
  reviewer: boolean;
}

const DEFAULT_SEL: RoleSel = { coordinator: true, builders: 2, scout: true, reviewer: true };

function buildRoles(sel: RoleSel): SwarmRoleSpec[] {
  const roles: SwarmRoleSpec[] = [];
  if (sel.coordinator) roles.push({ role: "coordinator" });
  for (let i = 0; i < sel.builders; i++) roles.push({ role: "builder" });
  if (sel.scout) roles.push({ role: "scout" });
  if (sel.reviewer) roles.push({ role: "reviewer" });
  return roles;
}

export function SwarmView() {
  /* project root: explicit explorer location wins; else follow the active pane. */
  const paneCwd = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return (tab && s.panes[tab.activePaneId]?.cwd) || null;
  });
  const explorerRoot = useExplorer((s) => s.root);
  const root = explorerRoot ?? paneCwd;

  const activeMissionId = useSwarm((s) => s.activeMissionId);
  const missions = useSwarm((s) => s.missions);
  const mission = activeMissionId ? missions[activeMissionId] : undefined;

  const [brief, setBrief] = useState("");
  const [sel, setSel] = useState<RoleSel>(DEFAULT_SEL);
  const [useWorktrees, setUseWorktrees] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<string>("all");
  const [cmd, setCmd] = useState("");
  const [confirmAbort, setConfirmAbort] = useState(false);

  /* Bind the swarm store to the live project root. */
  useEffect(() => {
    if (root) useSwarm.getState().setRoot(root);
  }, [root]);

  /* A target that no longer exists (mission changed) falls back to "all". */
  useEffect(() => {
    if (target !== "all" && mission && !mission.roles.some((r) => r.id === target)) {
      setTarget("all");
    }
  }, [target, mission]);

  const roleCount = buildRoles(sel).length;

  const launch = useCallback(async () => {
    const text = brief.trim();
    const roles = buildRoles(sel);
    if (!text || roles.length === 0 || launching) return;
    setLaunching(true);
    setError(null);
    try {
      await useSwarm.getState().startMission(text, roles, { useWorktrees });
      setBrief("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLaunching(false);
    }
  }, [brief, sel, useWorktrees, launching]);

  const send = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = cmd.trim();
      if (!text) return;
      const delivered = await useSwarm.getState().sendTo(target, text);
      setCmd("");
      setError(delivered === 0 ? "No live role pane received that message." : null);
    },
    [cmd, target],
  );

  const abort = useCallback(async () => {
    if (!mission) return;
    await useSwarm.getState().abort(mission.id);
    setConfirmAbort(false);
  }, [mission]);

  const newMission = useCallback(() => {
    setConfirmAbort(false);
    useSwarm.getState().setActiveMission(null);
  }, []);

  /* ── no project root: the quiet empty state ──────────────────────────────── */
  if (!root) {
    return (
      <div className="swarm-view">
        <div className="swarm-empty">
          <Icon name="ic-broadcast" className="icon" />
          <div className="swarm-empty-title">No project folder</div>
          <div className="swarm-empty-sub">
            A mission runs inside a project. Open a folder in a terminal pane and the
            composer loads here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="swarm-view">
      <div className="swarm-head">
        <span className="swarm-title">Swarm</span>
        <span className="swarm-root" title={root}>{root}</span>
        <span className="swarm-head-spacer" />
        {mission && (
          <>
            <span className={`swarm-mission-state st-${mission.status}`}>{mission.status}</span>
            <button type="button" className="swarm-btn" onClick={newMission}>
              <Icon name="ic-plus" size="sm" className="icon" />
              New mission
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="swarm-error" role="alert">
          <Icon name="ic-alert" size="sm" className="icon" />
          <span className="swarm-error-msg">{error}</span>
          <button type="button" className="swarm-error-x" aria-label="Dismiss" onClick={() => setError(null)}>
            <Icon name="ic-close" size="xs" className="icon" />
          </button>
        </div>
      )}

      {!mission ? (
        /* ── composer (T1 raised card) ────────────────────────────────────── */
        <div className="swarm-body">
          <form
            className="swarm-composer elev-1"
            onSubmit={(e) => {
              e.preventDefault();
              void launch();
            }}
          >
            <label className="swarm-field">
              <span className="swarm-field-label">Mission brief</span>
              <textarea
                className="swarm-brief"
                placeholder="Describe the mission. The coordinator breaks it into tasks for the roles below."
                aria-label="Mission brief"
                rows={5}
                spellCheck={false}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void launch();
                  }
                }}
              />
            </label>

            <div className="swarm-field">
              <span className="swarm-field-label">Roles</span>
              <div className="swarm-roles">
                <button
                  type="button"
                  className={`swarm-role-chip${sel.coordinator ? " on" : ""}`}
                  aria-pressed={sel.coordinator}
                  onClick={() => setSel((s) => ({ ...s, coordinator: !s.coordinator }))}
                >
                  coordinator
                </button>

                <div className={`swarm-role-chip stepper${sel.builders > 0 ? " on" : ""}`}>
                  <button
                    type="button"
                    className="swarm-step"
                    aria-label="Fewer builders"
                    disabled={sel.builders === 0}
                    onClick={() => setSel((s) => ({ ...s, builders: Math.max(0, s.builders - 1) }))}
                  >
                    −
                  </button>
                  <span className="swarm-step-label">
                    builder<span className="swarm-step-n tnum">×{sel.builders}</span>
                  </span>
                  <button
                    type="button"
                    className="swarm-step"
                    aria-label="More builders"
                    disabled={sel.builders >= MAX_BUILDERS}
                    onClick={() => setSel((s) => ({ ...s, builders: Math.min(MAX_BUILDERS, s.builders + 1) }))}
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className={`swarm-role-chip${sel.scout ? " on" : ""}`}
                  aria-pressed={sel.scout}
                  onClick={() => setSel((s) => ({ ...s, scout: !s.scout }))}
                >
                  scout
                </button>
                <button
                  type="button"
                  className={`swarm-role-chip${sel.reviewer ? " on" : ""}`}
                  aria-pressed={sel.reviewer}
                  onClick={() => setSel((s) => ({ ...s, reviewer: !s.reviewer }))}
                >
                  reviewer
                </button>
              </div>
            </div>

            <div className="swarm-composer-foot">
              <button
                type="button"
                className={`swarm-toggle${useWorktrees ? " on" : ""}`}
                role="switch"
                aria-checked={useWorktrees}
                onClick={() => setUseWorktrees((v) => !v)}
              >
                <span className="swarm-toggle-track" aria-hidden="true">
                  <span className="swarm-toggle-thumb" />
                </span>
                <span className="swarm-toggle-label">Isolated worktree per role</span>
              </button>

              <span className="swarm-composer-spacer" />
              <span className="swarm-role-count tnum">
                {roleCount} role{roleCount === 1 ? "" : "s"}
              </span>
              <m.button
                type="submit"
                className="swarm-btn primary"
                disabled={!brief.trim() || roleCount === 0 || launching}
                whileTap={pressTap}
              >
                <Icon name="ic-broadcast" size="sm" className="icon" />
                {launching ? "Launching…" : "Launch mission"}
              </m.button>
            </div>
          </form>
        </div>
      ) : (
        /* ── live mission ─────────────────────────────────────────────────── */
        <div className="swarm-body">
          <MissionTree
            node={{ mission, roles: mission.roles }}
            onFocusRole={(role) => {
              if (role.paneId) revealPane(role.paneId);
            }}
          />
        </div>
      )}

      {/* command bar — only while a mission is live */}
      {mission && mission.status === "running" && (
        <div className="swarm-cmd">
          {confirmAbort ? (
            <div className="swarm-abort-confirm" role="alertdialog" aria-label="Confirm abort">
              <span className="swarm-abort-q">Abort the mission? Every role pane is killed.</span>
              <button type="button" className="swarm-btn danger" onClick={() => void abort()}>
                Abort mission
              </button>
              <button type="button" className="swarm-btn" onClick={() => setConfirmAbort(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <form className="swarm-cmd-row" onSubmit={send}>
              <label className="swarm-cmd-target">
                <span className="swarm-at" aria-hidden="true">@</span>
                <select
                  className="swarm-select"
                  value={target}
                  aria-label="Message target"
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="all">all roles</option>
                  {mission.roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.id}</option>
                  ))}
                </select>
              </label>
              <input
                className="swarm-cmd-input"
                placeholder={`Message ${target === "all" ? "every live role" : `@${target}`}…`}
                aria-label="Message to roles"
                spellCheck={false}
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
              />
              <button type="button" className="swarm-btn danger ghost" onClick={() => setConfirmAbort(true)}>
                <Icon name="ic-close" size="sm" className="icon" />
                Abort
              </button>
              <m.button type="submit" className="swarm-btn primary" disabled={!cmd.trim()} whileTap={pressTap}>
                <Icon name="ic-play" size="sm" className="icon" />
                Send
              </m.button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
