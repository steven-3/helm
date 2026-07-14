/* ══════════════════════════════════════════════════════════════════════════
   ProgressCard (Stage widget) — an OscProgress: a label + determinate bar +
   percent. `max` defaults to 100; `value` is clamped to 0..max (osc.ts already
   guarantees value ≥ 0 and, if present, max > 0). When the payload carries an
   `id`, the store REPLACES this widget's payload in place on each re-emit (same
   React key), so the same bar element updates and the fill glides.

   The fill animates via transform: scaleX() (transform-only, §8) inside an
   overflow-clipped track — never width — so nothing distorts the pill radius and
   reduced-motion drops the glide cleanly. Complete (100%) tints success-green
   (§4.4 done); in-progress is the indigo info tone.
   ══════════════════════════════════════════════════════════════════════════ */
import { m } from "motion/react";
import { cardMotion } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscProgress, StageWidget } from "../lib/contract";

export function ProgressCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscProgress;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced

  const max = p.max !== undefined && p.max > 0 ? p.max : 100;
  const value = Math.min(Math.max(p.value, 0), max);
  const ratio = max === 0 ? 0 : value / max;
  const pct = Math.round(ratio * 100);
  const done = pct >= 100;

  // Trim a whole-number max/value readout (e.g. 42 / 100); keep decimals otherwise.
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-progress" className="icon xs" />Progress</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      <div className="prog-row">
        <div
          className="prog-track"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={p.label ?? "progress"}
        >
          <div
            className={`prog-fill${done ? " done" : ""}`}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
        <span className="prog-pct tnum">{pct}%</span>
      </div>

      <div className="card-hint">
        {p.label ? <span className="prog-label">{p.label}</span> : null}
        {p.label ? <span className="prog-dot" aria-hidden="true"> · </span> : null}
        <span className="prog-readout tnum">{fmt(value)} / {fmt(max)}</span>
      </div>
    </m.div>
  );
}
