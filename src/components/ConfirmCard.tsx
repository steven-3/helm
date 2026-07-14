/* ══════════════════════════════════════════════════════════════════════════
   ConfirmCard (Stage widget) — an OscConfirm: the agent's yes/no question + two
   buttons (indigo affirmative + neutral). Reads as one family with CopyBox /
   CommandCard (shared .card shell, head, hint).

   SECURITY / semantics (mirrors CommandCard — these cards write to the PTY):
   • A click sends the confirm's send-string to the SAME pane that surfaced it,
     via useStage.respond — which appends the single Enter and marks the widget
     answered. Surfacing / hovering never send; only this explicit click does.
   • `yes` / `no` are the program-supplied send-strings, written VERBATIM. When a
     program omits them (a bare confirm), we fall back to the universal CLI
     answers "y" / "n" (a program that needs "yes"/"deploy"/… supplies them).
   • One response only — guarded at the store AND disabled here once answered, so
     a double-submit is impossible from either side.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { m } from "motion/react";
import { useStage } from "../store/stage";
import { cardMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscConfirm, StageWidget } from "../lib/contract";

export function ConfirmCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscConfirm;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const answered = widget.answered ?? false;
  // Local record of THIS session's choice — the store only persists `answered`,
  // so on a fresh answer we can name what was sent; after a remount (pane switch)
  // it resets and the resolved row degrades to a generic "response sent".
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);

  // The literal bytes each button writes to the PTY (mirrors respond() exactly, so
  // the hint below is provably ground-truth). "Yes"/"No" are friendly labels; a
  // program can set yes/no to anything — the user must SEE the bytes before clicking.
  const yesSend = p.yes ?? "y";
  const noSend = p.no ?? "n";

  const respond = (which: "yes" | "no") => {
    if (widget.answered) return; // UI guard (the store guards too)
    setChoice(which);
    const send = which === "yes" ? yesSend : noSend;
    useStage.getState().respond(widget.id, send);
  };

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-alert" className="icon xs" />Confirm</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      <p className="prompt-text">{p.prompt}</p>

      {answered ? (
        <div className="prompt-resolved">
          <Icon name="ic-check" className="icon xs" />
          <span className="rv-text">
            {choice ? (
              <><span className="rv-label">sent </span><span className="rv-val">{choice === "yes" ? "Yes" : "No"}</span></>
            ) : (
              <span className="rv-label">response sent</span>
            )}
          </span>
        </div>
      ) : (
        <>
          <div className="prompt-actions" role="group" aria-label={p.prompt}>
            <m.button type="button" className="confirm-btn yes" onClick={() => respond("yes")} whileTap={pressTap}>
              Yes
            </m.button>
            <m.button type="button" className="confirm-btn no" onClick={() => respond("no")} whileTap={pressTap}>
              No
            </m.button>
          </div>
          {/* SECURITY: the buttons say "Yes"/"No" but write yesSend/noSend to the PTY
              — always show the exact bytes (mono = "literal data" signal; quoted so an
              empty or space-padded send stays visible). Replaces the old vague hint;
              long sends wrap and never overflow the dock. */}
          <div className="card-hint confirm-sends">
            <span className="cs-pair">
              Yes<span className="cs-arrow" aria-hidden="true">→</span>
              <span className="sr-only">sends </span><span className="cs-val">{yesSend}</span>
            </span>
            <span className="cs-sep" aria-hidden="true">·</span>
            <span className="cs-pair">
              No<span className="cs-arrow" aria-hidden="true">→</span>
              <span className="sr-only">sends </span><span className="cs-val">{noSend}</span>
            </span>
          </div>
        </>
      )}
    </m.div>
  );
}
