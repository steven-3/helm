/* ══════════════════════════════════════════════════════════════════════════
   useRoster — DERIVED from usePanes (single source of truth = panes). No
   duplicated state to drift. Track A fills elapsedMs/detail as it wires real
   PTY lifecycle; the shape is frozen (contract.ts RosterSession).
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from "react";
import { usePanes } from "./panes";
import type { Pane, RosterSession } from "../lib/contract";

const toSession = (p: Pane): RosterSession => ({
  id: p.id,
  agent: p.agent,
  model: p.model,
  title: p.title,
  state: p.state,
  detail: p.state === "error" ? "exit 1" : p.cwd,
});

/** Live roster of helm's own panes. */
export function useRoster(): RosterSession[] {
  const panes = usePanes((s) => s.panes);
  return useMemo(() => Object.values(panes).map(toSession), [panes]);
}

/** Counts by agent, for the sidebar legend + status bar. */
export function useRosterCounts() {
  const panes = usePanes((s) => s.panes);
  return useMemo(() => {
    let claude = 0, codex = 0, shell = 0, running = 0;
    for (const p of Object.values(panes)) {
      if (p.agent === "claude") claude++;
      else if (p.agent === "codex") codex++;
      else shell++;
      if (p.state === "running") running++;
    }
    return { claude, codex, shell, running, total: claude + codex + shell };
  }, [panes]);
}
