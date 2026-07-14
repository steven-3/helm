/* ══════════════════════════════════════════════════════════════════════════
   useRoster — DERIVED from usePanes (single source of truth = panes). No
   duplicated state to drift. Every field maps to a real source: state comes
   from the PTY lifecycle, detail is the real exit code (error) or the real
   cwd — nothing is fabricated.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePanes } from "./panes";
import type { Pane, RosterSession } from "../lib/contract";

const toSession = (p: Pane): RosterSession => ({
  id: p.id,
  agent: p.agent,
  model: p.model,
  command: p.command,
  title: p.title,
  state: p.state,
  detail:
    p.state === "error" && p.exitCode != null ? `exit ${p.exitCode}` : p.cwd,
});

/** Live roster of helm's own panes. */
export function useRoster(): RosterSession[] {
  const panes = usePanes((s) => s.panes);
  return useMemo(() => Object.values(panes).map(toSession), [panes]);
}

/** Counts by agent, for the sidebar legend + status bar. */
export function useRosterCounts() {
  return usePanes(
    useShallow((s) => {
      let claude = 0, codex = 0, shell = 0, running = 0;
      for (const p of Object.values(s.panes)) {
        if (p.agent === "claude" || p.agent === "opus") claude++;
        else if (p.agent === "codex") codex++;
        else shell++;
        if (p.state === "running") running++;
      }
      return { claude, codex, shell, running, total: claude + codex + shell };
    }),
  );
}
