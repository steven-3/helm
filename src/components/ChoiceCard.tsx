/* ══════════════════════════════════════════════════════════════════════════
   ChoiceCard (Stage widget) — an OscChoice: the agent's prompt + a vertical list
   of option rows. The label is shown; the option's `send` string is written to
   the pane on click. One family with CopyBox / CommandCard (shared .card shell).

   SECURITY / semantics (these cards write to the PTY):
   • A click sends that option's `send` string VERBATIM to the SAME pane that
     surfaced the widget, via useStage.respond (which appends the single Enter and
     marks the widget answered). Surfacing / hovering never send.
   • One response only — guarded at the store AND the rows disable here once
     answered, so no double-submit is possible from either side.
   • The chosen row keeps the accent + check; the rest dim. After a remount the
     specific choice is not known (store persists only `answered`) — the rows just
     read disabled and the hint degrades to "response sent".
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { m } from "motion/react";
import { useStage } from "../store/stage";
import { cardMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscChoice, StageWidget } from "../lib/contract";

export function ChoiceCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscChoice;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const answered = widget.answered ?? false;
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);

  const choose = (idx: number, send: string) => {
    if (widget.answered) return; // UI guard (the store guards too)
    setChosenIdx(idx);
    useStage.getState().respond(widget.id, send); // send VERBATIM; store appends Enter
  };

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-roster" className="icon xs" />Choice</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      <p className="prompt-text">{p.prompt}</p>

      <div className="choice-list" role="group" aria-label={p.prompt}>
        {p.options.map((opt, i) => {
          // label/send are required strings but may be empty — degrade gracefully.
          const label = opt.label.trim() || opt.send.trim() || `option ${i + 1}`;
          // SECURITY: the click writes opt.send VERBATIM to the PTY, but the row only
          // SHOWS `label` ("Continue" could dispatch "rm -rf ~"). Surface the literal
          // send-string (mono, dimmer/smaller, ALWAYS visible — never a tooltip) when
          // it differs from what's shown. Empty send, or send === label → no dup hint.
          const showSend = opt.send.length > 0 && opt.send !== label;
          const isChosen = chosenIdx === i;
          return (
            <m.button
              key={i}
              type="button"
              className={`choice-opt${isChosen ? " chosen" : ""}`}
              disabled={answered}
              onClick={() => choose(i, opt.send)}
              whileTap={answered ? undefined : pressTap}
            >
              <span className="choice-text">
                <span className="choice-label">{label}</span>
                {showSend && (
                  <span className="choice-send">
                    <span className="sr-only">sends </span>
                    <span className="choice-send-arrow" aria-hidden="true">→</span>
                    <span className="choice-send-val">{opt.send}</span>
                  </span>
                )}
              </span>
              {isChosen && <Icon name="ic-check" className="icon xs choice-check" />}
            </m.button>
          );
        })}
      </div>

      <div className="card-hint">{answered ? "response sent" : "pick one — sent to the pane"}</div>
    </m.div>
  );
}
