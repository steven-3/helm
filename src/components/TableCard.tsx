/* ══════════════════════════════════════════════════════════════════════════
   TableCard (Stage widget) — an OscTable: a real <table> in a recessed, both-axis
   scrollable well with a sticky header row. Columns/rows come straight from the
   validated payload (osc.ts caps columns ≤16, rows ≤200, cells ≤500 chars). Mono
   cells (tabular data), header + row-hover for scan-ability. One card family with
   CommandCard / CopyBox (shared .card shell, head, hint).
   ══════════════════════════════════════════════════════════════════════════ */
import { m } from "motion/react";
import { cardMotion } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscTable, StageWidget } from "../lib/contract";

export function TableCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscTable;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const rowCount = p.rows.length;
  const colCount = p.columns.length;

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-table" className="icon xs" />Table</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      {/* Recessed sheet well — scrolls on BOTH axes so a wide or tall table stays
          inside the card and can never widen the dock (§ overflow gate). */}
      <div className="tbl-wrap" tabIndex={0} role="group" aria-label={p.label ?? "table"}>
        <table className="tbl">
          <thead>
            <tr>
              {p.columns.map((col, i) => (
                <th key={i} scope="col">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-hint tnum">
        {p.label
          ? `${p.label} · ${rowCount} ${rowCount === 1 ? "row" : "rows"}`
          : `${rowCount} ${rowCount === 1 ? "row" : "rows"} × ${colCount} ${colCount === 1 ? "column" : "columns"}`}
      </div>
    </m.div>
  );
}
