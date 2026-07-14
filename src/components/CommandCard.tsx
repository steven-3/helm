/* ══════════════════════════════════════════════════════════════════════════
   CommandCard (Stage widget) — renders an OscCommand: the command shown VERBATIM
   in a recessed mono well + a single "Run in pane" primary (the rare indigo).
   Shape/spacing mirror CopyBox.tsx so it reads as one card family.

   SECURITY (WS-6 — the whole reason a command artifact is safe to surface):
   • NEVER auto-runs. The command runs ONLY on this explicit Run click / Enter /
     Space — surfacing it, selecting it, or hovering it does nothing.
   • Written EXACTLY as received — verbatim, no shell expansion, no chaining, no
     mutation. The trailing "\r" is the Enter keystroke the user would have typed,
     never a second command.
   • SAME pane only — it is written to widget.paneId, the pane that surfaced it,
     never a different/global session.
   • `caution` renders a visual-only warning chip; it is NOT a gate — the button
     still runs. It nudges the human to read before committing, nothing more.
   ══════════════════════════════════════════════════════════════════════════ */
import { m } from "motion/react";
import { ptyWrite } from "../lib/commands";
import { cardMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscCommand, StageWidget } from "../lib/contract";

export function CommandCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscCommand;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced

  // The ONLY code path that runs anything. Writes p.command EXACTLY (verbatim) to
  // the SAME pane that surfaced this card (widget.paneId) + a single trailing
  // carriage return (the Enter the user would press). No expansion, no chaining,
  // no second command, no other pane. A native <button> so Enter/Space fire this
  // for free; caution never blocks it.
  const run = () => {
    void ptyWrite(widget.paneId, p.command + "\r");
  };

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-shell" className="icon xs" />Command</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      {/* Recessed mono well — the command shown verbatim + selectable (user can
          also hand-copy it). A muted "$" prompt marks it as a shell command
          without spending colour. Wraps (never scrolls horizontally). */}
      <div className="cmd-well">
        <span className="cmd-prompt" aria-hidden="true">$</span>
        <code className="cmd-text">{p.command}</code>
      </div>

      <div className="cmd-foot">
        <m.button
          type="button"
          className="cmd-run"
          onClick={run}
          whileTap={pressTap}
          aria-label={`Run ${p.label ?? p.command} in this pane`}
        >
          <Icon name="ic-play" className="icon xs" />
          Run in pane
        </m.button>
        {p.caution && (
          <span className="cmd-caution">
            <Icon name="ic-alert" className="icon xs" />
            check before running
          </span>
        )}
      </div>

      <div className="card-hint">
        {p.label ? `${p.label} · runs in this pane` : "click Run to type this into the pane"}
      </div>
    </m.div>
  );
}
