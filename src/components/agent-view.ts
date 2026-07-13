/* ══════════════════════════════════════════════════════════════════════════
   Shared view helpers — the DESIGN.md §10 identity/state recipe, one source so
   the roster, tabs, panes and status bar encode agents + states identically.

   IDENTITY  = agent colour key (cl/cx/gn) + distinct glyph + the agent WORD.
   STATE     = its OWN dot/icon + state word, never colour-alone.
   Both always pair colour with a glyph/word (§4.3: never colour-only).
   ══════════════════════════════════════════════════════════════════════════ */
import type { AgentKind, PaneState } from "../lib/contract";
import type { IconName } from "./icons";

export type AgentKey = "cl" | "cx" | "gn";

export interface AgentVis {
  key: AgentKey;
  glyph: IconName;
  /** The agent NAME carried as text (identity, not colour-only). */
  word: string;
}

export function agentVis(agent: AgentKind, command?: string): AgentVis {
  if (agent === "claude") return { key: "cl", glyph: "ic-claude", word: "claude" };
  if (agent === "codex") return { key: "cx", glyph: "ic-codex", word: "codex" };
  // generic shell: the agent word is the launch command (e.g. "bash", "zsh").
  return { key: "gn", glyph: "ic-shell", word: command || "bash" };
}

/** Roster/pane sublabel detail after the agent word: model for CLIs, cwd for shells. */
export function agentDetail(agent: AgentKind, model?: string, cwd?: string): string | undefined {
  if (agent === "shell") return cwd;
  return model;
}

export interface StateVis {
  /** state-column modifier class (st-run / st-idle / st-attn / st-err / st-done). */
  cls: string;
  word: string;
  /** indicator kind: a colour dot, or a glyph icon. */
  kind: "dot" | "icon";
  /** dot modifier (agent key or "idle") when kind === "dot". */
  dot?: AgentKey | "idle";
  /** icon name when kind === "icon". */
  icon?: IconName;
  /** whether the indicator pulses (running / needs-input — §8 ambient pulse). */
  pulse: boolean;
}

export function stateVis(state: PaneState, agentKey: AgentKey): StateVis {
  switch (state) {
    case "running":
      return {
        cls: agentKey === "cx" ? "st-run cx" : "st-run",
        word: "running",
        kind: "dot",
        dot: agentKey === "gn" ? "idle" : agentKey, // generic shell "running" → neutral dot
        pulse: true,
      };
    case "needs-input":
      return { cls: "st-attn", word: "needs input", kind: "icon", icon: "ic-alert", pulse: true };
    case "error":
      return { cls: "st-err", word: "error", kind: "icon", icon: "ic-alert", pulse: false };
    case "done":
      return { cls: "st-done", word: "done", kind: "icon", icon: "ic-check", pulse: false };
    case "idle":
    default:
      return { cls: "st-idle", word: "idle", kind: "dot", dot: "idle", pulse: false };
  }
}
