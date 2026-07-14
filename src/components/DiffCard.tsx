/* ══════════════════════════════════════════════════════════════════════════
   DiffCard (Stage widget) — an OscDiff rendered line-by-line in a recessed,
   scrollable mono well. Additions (+) get a green tint, deletions (−) a red tint,
   @@ hunk rails the indigo/info tone, file headers a muted meta tone, everything
   else plain — the SAME semantic tokens DiffView / scm.css use
   (--status-success/danger-subtle+text, --accent-text for @@), so the two diff
   surfaces read identically. Lines wrap-free + the well scrolls on both axes, so a
   wide diff never widens the dock.
   ══════════════════════════════════════════════════════════════════════════ */
import { m } from "motion/react";
import { cardMotion } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscDiff, StageWidget } from "../lib/contract";

type Kind = "add" | "del" | "hunk" | "meta" | "ctx";

function classify(line: string): Kind {
  if (line.startsWith("@@")) return "hunk";
  // file-level headers read as muted meta (not a wall of green/red)
  if (
    line.startsWith("+++") || line.startsWith("---") ||
    line.startsWith("diff ") || line.startsWith("index ") ||
    line.startsWith("\\ ")
  ) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

export function DiffCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscDiff;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced

  const lines = p.diff.replace(/\r\n?/g, "\n").split("\n");
  // git appends a trailing newline → drop the final empty element so it is not
  // mis-rendered as a blank context row.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const rows = lines.map((text) => ({ text, kind: classify(text) }));
  const added = rows.filter((r) => r.kind === "add").length;
  const removed = rows.filter((r) => r.kind === "del").length;

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-diff" className="icon xs" />Diff</span>
        <span className="card-head-right">
          {(added > 0 || removed > 0) && (
            <span className="dcard-stat tnum" aria-label={`${added} added, ${removed} removed`}>
              <span className="add">+{added}</span>
              <span className="del">&minus;{removed}</span>
            </span>
          )}
          {src ? (
            <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
          ) : (
            <span className="card-src">files</span>
          )}
        </span>
      </div>

      <div className="dcard-well" tabIndex={0} role="figure" aria-label={p.label ?? "diff"}>
        <div className="dcard-lines">
          {rows.map((r, i) => (
            <div className={`dcard-line d-${r.kind}`} key={i}>
              <code>{r.text || " "}</code>
            </div>
          ))}
        </div>
      </div>

      {p.label && <div className="card-hint">{p.label}</div>}
    </m.div>
  );
}
