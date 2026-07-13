/* ══════════════════════════════════════════════════════════════════════════
   RosterView (§10 recipe) — live sessions derived from usePanes.

   Two clusters, kept visually SEPARATE:
     · IDENTITY (left)  = agent dot + distinct glyph + the agent WORD in the
       sublabel (claude · opus-4.8). The task NAME ellipsizes here — never identity.
     · STATE (right)    = its own dot/icon + state word in a fixed 92px column that
       NEVER truncates (running/idle/needs input/error), pulse on running/needs-input.
   Rows are transparent on the panel (not card-soup); hover → surface-hover;
   selected (= active pane) → surface-active + 2px accent bar. Clicking a row
   focuses that pane and brings its tab forward.
   ══════════════════════════════════════════════════════════════════════════ */
import { usePanes } from "../store/panes";
import { useRoster, useRosterCounts } from "../store/roster";
import { agentVis, stateVis } from "./agent-view";
import { Icon } from "./icons";
import type { RosterSession } from "../lib/contract";

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function sublabel(s: RosterSession): { word: string; key: "cl" | "cx" | "gn"; rest: string } {
  const vis = agentVis(s.agent, s.model);
  const mid = s.agent === "shell" ? s.detail : s.model;
  const parts: string[] = [];
  if (mid) parts.push(mid);
  if (s.state === "error" && s.agent !== "shell" && s.detail) parts.push(s.detail); // "exit 1"
  else if (s.state === "running" && s.elapsedMs != null) parts.push(fmtElapsed(s.elapsedMs));
  return { word: vis.word, key: vis.key, rest: parts.join(" · ") };
}

export function RosterView() {
  const sessions = useRoster();
  const counts = useRosterCounts();
  const selectedId = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.activePaneId ?? "";
  });
  const focusPane = usePanes((s) => s.focusPane);
  const setActiveTab = usePanes((s) => s.setActiveTab);

  const select = (id: string) => {
    const pane = usePanes.getState().panes[id];
    if (pane) setActiveTab(pane.tabId);
    focusPane(id);
  };

  return (
    <>
      <div className="side-head">
        <span className="side-title">ROSTER</span>
        <span className="side-count tnum">{counts.total}</span>
      </div>
      <div className="roster-legend">
        <span><i className="dot cl" />{counts.claude} claude</span>
        <span><i className="dot cx" />{counts.codex} codex</span>
        <span><i className="dot gn" />{counts.shell} shell</span>
      </div>
      <div className="side-sep" />

      <div className="roster" role="list">
        {sessions.map((s) => {
          const vis = agentVis(s.agent, s.model);
          const sub = sublabel(s);
          const st = stateVis(s.state, vis.key);
          const selected = s.id === selectedId;
          return (
            <div
              key={s.id}
              role="listitem"
              className={`rrow${selected ? " selected" : ""}`}
              aria-current={selected || undefined}
              tabIndex={0}
              onClick={() => select(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(s.id);
                }
              }}
            >
              <span className="r-id">
                <i className={`rdot-id ${vis.key}`} />
                <Icon name={vis.glyph} size="sm" className={`icon sm rglyph ${vis.key}`} />
              </span>
              <div className="rmeta">
                <div className="rname">{s.title}</div>
                <div className="rsub">
                  <span className={`agent-word ${sub.key}`}>{sub.word}</span>
                  {sub.rest && ` · ${sub.rest}`}
                </div>
              </div>
              <span className={`rstate ${st.cls}`}>
                <span className="s-ind">
                  {st.kind === "dot" ? (
                    <i className={`sdot ${st.dot}${st.pulse ? " pulse" : ""}`} />
                  ) : (
                    <Icon name={st.icon!} size="xs" className={`icon xs${st.pulse ? " pulse" : ""}`} />
                  )}
                </span>
                <span className="sword">{st.word}</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
