/* ══════════════════════════════════════════════════════════════════════════
   MissionTree — the live role tree of one swarm mission (§4.5 + §7.2).

   A trunk (the mission) with one branch per role. Each role node carries, kept
   separate per §4.4/§4.5:
     · identity = a seat-color connector edge + a .seat-dot + the seat WORD
       (hue via [data-seat] → the SHARED seatHueFor resolver, so a seat is
       colored the same on board cards and here). Never color alone.
     · state    = a status glyph + status word in a dedicated column (queued/
       running/blocked/done/failed/aborted); running wears the one ambient pulse.
   Click a role → focus its pane (the caller wires revealPane). Pure component:
   it reads the seat map to resolve hues but renders only what it is handed.
   ══════════════════════════════════════════════════════════════════════════ */
import { useModelHub } from "../store/modelhub";
import type { Mission, MissionRole, MissionStatus, RoleStatus } from "../store/swarm";
import { seatHueFor } from "./BoardCard";
import { Icon, type IconName } from "./icons";

type Tone = "info" | "success" | "warning" | "danger" | "muted";

/* role state → glyph + word + tone (state is never carried by color alone). */
const ROLE_VIS: Record<RoleStatus, { icon: IconName; word: string; tone: Tone; running?: boolean }> = {
  spawning: { icon: "ic-progress", word: "queued", tone: "muted" },
  working: { icon: "ic-broadcast", word: "running", tone: "info", running: true },
  blocked: { icon: "ic-alert", word: "blocked", tone: "warning" },
  done: { icon: "ic-check", word: "done", tone: "success" },
  failed: { icon: "ic-alert", word: "failed", tone: "danger" },
  aborted: { icon: "ic-close", word: "aborted", tone: "muted" },
};

const MISSION_WORD: Record<MissionStatus, string> = {
  planning: "planning",
  running: "running",
  done: "done",
  aborted: "aborted",
};

export function MissionTree({
  node,
  onFocusRole,
}: {
  node: { mission: Mission; roles: MissionRole[] };
  onFocusRole: (role: MissionRole) => void;
}) {
  const seats = useModelHub((s) => s.seats);
  const { mission, roles } = node;

  return (
    <div className="mission-tree" role="tree" aria-label="Mission roles">
      <div className="mt-root" role="treeitem" aria-selected={false}>
        <span className="mt-root-glyph" aria-hidden="true">
          <Icon name="ic-broadcast" className="icon" />
        </span>
        <div className="mt-root-main">
          <div className="mt-root-name">Mission</div>
          {mission.brief && <div className="mt-root-brief">{mission.brief}</div>}
        </div>
        <span className={`mt-status st-${mission.status}`}>
          <span className="mt-status-word">{MISSION_WORD[mission.status]}</span>
          {mission.useWorktrees && <span className="mt-root-tag">worktrees</span>}
        </span>
      </div>

      <ul className="mt-branches" role="group">
        {roles.map((role) => {
          const hue = seatHueFor(role.seat, seats);
          const vis = ROLE_VIS[role.status];
          const focusable = Boolean(role.paneId);
          return (
            <li className="mt-branch" data-seat={hue} key={role.id}>
              <button
                type="button"
                className="mt-role"
                role="treeitem"
                aria-selected={false}
                aria-label={`${role.role} (${role.seat}), ${vis.word}`}
                disabled={!focusable}
                title={focusable ? "Focus this role's pane" : "No pane linked"}
                onClick={() => onFocusRole(role)}
              >
                <span className="mt-role-id">
                  <i className="seat-dot" aria-hidden="true" />
                  <span className="mt-role-name">{role.role}</span>
                  <span className="mt-role-seat">{role.seat}</span>
                </span>
                <span className="mt-role-msg">{role.lastMsg?.trim() || "—"}</span>
                <span className={`mt-status tone-${vis.tone}${vis.running ? " running" : ""}`}>
                  <span className={`mt-status-ic${vis.running ? " pulse" : ""}`} aria-hidden="true">
                    <Icon name={vis.icon} size="xs" className="icon" />
                  </span>
                  <span className="mt-status-word">{vis.word}</span>
                </span>
              </button>
            </li>
          );
        })}
        {roles.length === 0 && <li className="mt-empty">No roles in this mission.</li>}
      </ul>
    </div>
  );
}
