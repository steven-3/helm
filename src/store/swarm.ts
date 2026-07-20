/* ══════════════════════════════════════════════════════════════════════════
   useSwarm — mission orchestration (§4.5). MVP honest scope: roles are prompt
   templates + plumbing — no magic.

   A mission = .helm/missions/<id>/mission.json + mailbox/*.md. startMission
   spawns one session per requested role through the SAME dispatch primitive
   the board uses (context pack per role, seat launcher from the Model Hub,
   optional isolated git worktree per role). Role task ids are namespaced
   "<missionId>.<roleId>" so the board's card-id handler ignores them; the
   swarm's own task.* subscription advances the mission tree.

   Mailbox convention (role packs instruct read-before-work):
     .helm/missions/<id>/mailbox/<author>-<ts>.md
   sendTo routes text to one/all role panes via pty_write (dispatch.sendToPane).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { helmStoreRead, helmStoreWrite, worktreeAdd, onTaskVerb, type TaskVerb } from "../lib/ipc";
import { dispatchTask, sendToPane } from "../lib/dispatch";
import { ptyKill } from "../lib/commands";

export type MissionStatus = "planning" | "running" | "done" | "aborted";
export type RoleStatus = "spawning" | "working" | "blocked" | "done" | "failed" | "aborted";

export interface SwarmRoleSpec {
  /** Role name — "coordinator" | "builder" | "scout" | "reviewer" | custom. */
  role: string;
  /** Model Hub seat; defaults to the role name. */
  seat?: string;
  /** Role-specific brief appended to the mission brief. */
  brief?: string;
}

export interface MissionRole {
  id: string;
  role: string;
  seat: string;
  /** Namespaced task id the role reports with ("<missionId>.<roleId>"). */
  taskId: string;
  status: RoleStatus;
  paneId?: string;
  sessionId?: string;
  /** Worktree path when the mission fanned out into worktrees. */
  worktree?: string;
  lastMsg?: string;
  ts: number;
}

export interface Mission {
  id: string;
  brief: string;
  status: MissionStatus;
  roles: MissionRole[];
  createdTs: number;
  updatedTs: number;
  useWorktrees: boolean;
}

export interface MissionTreeNode {
  mission: Mission;
  roles: MissionRole[];
}

interface SwarmState {
  root: string | null;
  missions: Record<string, Mission>;
  activeMissionId: string | null;

  /** Bind the store to a project root (missions persist under its .helm/). */
  setRoot: (root: string) => void;
  /** Spawn one session per role; resolves the mission id. */
  startMission: (
    brief: string,
    roles: SwarmRoleSpec[],
    opts?: { useWorktrees?: boolean },
  ) => Promise<string>;
  /** Tree view of one mission (default: active). Null when none. */
  missionTree: (missionId?: string) => MissionTreeNode | null;
  /** Route text to one role's pane or every live role pane of the mission. */
  sendTo: (agentId: string | "all", msg: string) => Promise<number>;
  /** Kill every role PTY and mark the mission aborted. */
  abort: (id: string) => Promise<void>;
  setActiveMission: (id: string | null) => void;
  /** Post a markdown note into the mission mailbox. */
  postMailbox: (missionId: string, author: string, body: string) => Promise<void>;
}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "role";

const missionRelPath = (id: string) => `missions/${id}/mission.json`;

function rolePrompt(role: string): string {
  switch (role) {
    case "coordinator":
      return [
        "You are the mission COORDINATOR. Break the brief into concrete tasks,",
        "post the plan to the mailbox first, then track the other roles' mailbox",
        "updates and reconcile conflicts. You do not implement.",
      ].join(" ");
    case "scout":
      return [
        "You are the SCOUT. Map the relevant code first (files, entry points,",
        "contracts) and post your findings to the mailbox BEFORE any builder",
        "starts. Keep findings terse: file:line conclusions.",
      ].join(" ");
    case "reviewer":
      return [
        "You are the REVIEWER. Wait for builders' mailbox receipts, then review",
        "their diffs for correctness and contract adherence. Post findings to",
        "the mailbox; report blocked if a change must be revised.",
      ].join(" ");
    default:
      return [
        `You are a ${role.toUpperCase()}. Implement your slice of the mission`,
        "brief. Stay inside your assigned scope; coordinate anything shared",
        "through the mailbox.",
      ].join(" ");
  }
}

function mailboxSection(missionId: string): { heading: string; body: string } {
  return {
    heading: "Mission mailbox (read before working)",
    body: [
      `This session is part of mission \`${missionId}\`.`,
      "",
      `1. READ every file in \`.helm/missions/${missionId}/mailbox/\` before starting work.`,
      `2. POST your updates as \`.helm/missions/${missionId}/mailbox/<your-role>-<n>.md\``,
      "   (plan, findings, receipts, conflicts). One short md file per update.",
      "3. Never edit another role's mailbox files.",
    ].join("\n"),
  };
}

function persistMission(mission: Mission): void {
  const root = useSwarm.getState().root;
  if (!root) return;
  void helmStoreWrite(root, missionRelPath(mission.id), JSON.stringify(mission, null, 2))
    .catch(() => {
      // Best-effort persistence; the live store stays authoritative.
    });
}

function patchRole(
  missions: Record<string, Mission>,
  missionId: string,
  roleId: string,
  patch: Partial<MissionRole>,
): Record<string, Mission> {
  const mission = missions[missionId];
  if (!mission) return missions;
  const updated: Mission = {
    ...mission,
    updatedTs: Date.now(),
    roles: mission.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role)),
  };
  return { ...missions, [missionId]: updated };
}

/** Every role settled → mission done (unless aborted). */
function settleMission(mission: Mission): Mission {
  if (mission.status !== "running") return mission;
  const allDone = mission.roles.length > 0 &&
    mission.roles.every((role) => role.status === "done" || role.status === "failed" || role.status === "aborted");
  return allDone ? { ...mission, status: "done", updatedTs: Date.now() } : mission;
}

export const useSwarm = create<SwarmState>((set, get) => ({
  root: null,
  missions: {},
  activeMissionId: null,

  setRoot: (root) => set({ root }),

  startMission: async (brief, roles, opts) => {
    const root = get().root;
    if (!root) throw new Error("swarm: setRoot(projectRoot) before startMission");
    if (roles.length === 0) throw new Error("swarm: a mission needs at least one role");

    const missionId = uid("m");
    const useWorktrees = opts?.useWorktrees === true;
    const now = Date.now();

    // Seed the mailbox with the brief so read-before-work has something real.
    await helmStoreWrite(
      root,
      `missions/${missionId}/mailbox/brief.md`,
      `# Mission brief\n\n${brief.trim()}\n`,
    );

    const missionRoles: MissionRole[] = [];
    for (let index = 0; index < roles.length; index++) {
      const spec = roles[index];
      const roleId = `${slug(spec.role)}-${index + 1}`;
      const taskId = `${missionId}.${roleId}`;
      const role: MissionRole = {
        id: roleId,
        role: spec.role,
        seat: spec.seat ?? spec.role,
        taskId,
        status: "spawning",
        ts: now,
      };

      let cwd: string | undefined;
      if (useWorktrees) {
        try {
          const created = await worktreeAdd(root, `helm/${missionId}-${roleId}`, "HEAD");
          role.worktree = created.path;
          cwd = created.path;
        } catch {
          // Worktree creation failed (dirty repo, not a repo) — fall back to
          // the shared project dir rather than losing the role.
        }
      }

      try {
        const receipt = await dispatchTask({
          id: taskId,
          title: `${spec.role} — mission ${missionId}`,
          body: [brief.trim(), spec.brief?.trim()].filter(Boolean).join("\n\n"),
          seat: role.seat,
          projectRoot: root,
          cwd,
          paneTitle: `${spec.role} · ${missionId}`,
          extraSections: [
            { heading: "Role", body: rolePrompt(spec.role) },
            mailboxSection(missionId),
          ],
        });
        role.paneId = receipt.paneId;
        role.sessionId = receipt.sessionId;
        role.status = "working";
      } catch {
        role.status = "failed";
        role.lastMsg = "Spawn failed";
      }
      missionRoles.push(role);
    }

    const mission: Mission = {
      id: missionId,
      brief: brief.trim(),
      status: "running",
      roles: missionRoles,
      createdTs: now,
      updatedTs: Date.now(),
      useWorktrees,
    };
    set((s) => ({
      missions: { ...s.missions, [missionId]: mission },
      activeMissionId: missionId,
    }));
    persistMission(mission);
    return missionId;
  },

  missionTree: (missionId) => {
    const s = get();
    const id = missionId ?? s.activeMissionId;
    const mission = id ? s.missions[id] : undefined;
    return mission ? { mission, roles: mission.roles } : null;
  },

  sendTo: async (agentId, msg) => {
    const s = get();
    const mission = s.activeMissionId ? s.missions[s.activeMissionId] : undefined;
    if (!mission || !msg.trim()) return 0;
    const targets = mission.roles.filter(
      (role) =>
        role.paneId &&
        (role.status === "working" || role.status === "blocked") &&
        (agentId === "all" || role.id === agentId || role.role === agentId),
    );
    let delivered = 0;
    for (const role of targets) {
      if (await sendToPane(role.paneId!, msg)) delivered++;
    }
    return delivered;
  },

  abort: async (id) => {
    const mission = get().missions[id];
    if (!mission || mission.status === "aborted") return;
    for (const role of mission.roles) {
      if (role.paneId && (role.status === "working" || role.status === "blocked" || role.status === "spawning")) {
        await ptyKill(role.paneId).catch(() => {
          // Process already gone — aborting stays idempotent.
        });
      }
    }
    set((s) => {
      const current = s.missions[id];
      if (!current) return s;
      const aborted: Mission = {
        ...current,
        status: "aborted",
        updatedTs: Date.now(),
        roles: current.roles.map((role) =>
          role.status === "done" || role.status === "failed" ? role : { ...role, status: "aborted" },
        ),
      };
      persistMission(aborted);
      return { missions: { ...s.missions, [id]: aborted } };
    });
  },

  setActiveMission: (id) => set({ activeMissionId: id }),

  postMailbox: async (missionId, author, body) => {
    const root = get().root;
    if (!root) return;
    const relPath = `missions/${missionId}/mailbox/${slug(author)}-${Date.now()}.md`;
    await helmStoreWrite(root, relPath, body.endsWith("\n") ? body : `${body}\n`);
  },
}));

/* ── task.* verbs from role sessions advance the mission tree (§4.5) ──────── */
function handleTaskVerb(verb: TaskVerb): void {
  const dot = verb.taskId.indexOf(".");
  if (dot <= 0) return; // not a namespaced swarm task id
  const missionId = verb.taskId.slice(0, dot);
  const roleId = verb.taskId.slice(dot + 1);
  const state = useSwarm.getState();
  const mission = state.missions[missionId];
  if (!mission || !mission.roles.some((role) => role.id === roleId)) return;

  const status: RoleStatus =
    verb.kind === "task.done" ? "done" : verb.kind === "task.blocked" ? "blocked" : "working";

  useSwarm.setState((s) => {
    const missions = patchRole(s.missions, missionId, roleId, {
      status,
      lastMsg: verb.msg,
      ts: verb.ts,
    });
    const updated = settleMission(missions[missionId]);
    const next = { ...missions, [missionId]: updated };
    persistMission(updated);
    return { missions: next };
  });
}

onTaskVerb(handleTaskVerb);

/** Restore persisted missions for a project (Fleet Home history). */
export async function loadMission(root: string, missionId: string): Promise<Mission | null> {
  try {
    const raw = await helmStoreRead(root, missionRelPath(missionId));
    const mission = JSON.parse(raw) as Mission;
    if (typeof mission.id !== "string" || !Array.isArray(mission.roles)) return null;
    useSwarm.setState((s) => ({ missions: { ...s.missions, [mission.id]: mission } }));
    return mission;
  } catch {
    return null;
  }
}
