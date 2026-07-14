/* ══════════════════════════════════════════════════════════════════════════
   AskCard (Stage widget) — an OscAsk: the agent's prompt + a single-line text
   input and a Send. One family with CopyBox / CommandCard (shared .card shell).

   SECURITY / semantics (these cards write to the PTY):
   • Submit sends the typed text VERBATIM to the SAME pane that surfaced the
     widget, via useStage.respond (which appends the single Enter and marks the
     widget answered). Nothing is sent until the user submits.
   • Enter in the field submits (native form submit); so does the Send button.
   • An empty submit is allowed — it is the terminal idiom "press Enter to accept
     the default"; the resolved row makes an empty send explicit.
   • One response only — guarded at the store AND the input/Send are replaced by
     the resolved row here once answered, so no double-submit is possible.
   • The input is freeform text → --font-sans (§10); the sent value is echoed in
     --font-mono (the app's "this is the literal data that was sent" signal).
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { m } from "motion/react";
import { useStage } from "../store/stage";
import { cardMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscAsk, StageWidget } from "../lib/contract";

export function AskCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscAsk;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const answered = widget.answered ?? false;
  const [value, setValue] = useState("");
  // Local record of what was sent this session (store persists only `answered`).
  const [sent, setSent] = useState<string | null>(null);

  const submit = () => {
    if (widget.answered) return; // UI guard (the store guards too)
    setSent(value);
    useStage.getState().respond(widget.id, value); // typed text VERBATIM; store appends Enter
  };

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-pencil" className="icon xs" />Ask</span>
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
            {sent === null ? (
              <span className="rv-label">response sent</span>
            ) : sent.length ? (
              <><span className="rv-label">sent </span><span className="rv-val mono">{sent}</span></>
            ) : (
              <span className="rv-label">sent an empty line</span>
            )}
          </span>
        </div>
      ) : (
        <>
          <form className="ask-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <input
              className="ask-input"
              type="text"
              value={value}
              placeholder={p.placeholder || "Type a response…"}
              onChange={(e) => setValue(e.target.value)}
              aria-label={p.prompt}
              autoComplete="off"
              spellCheck={false}
            />
            <m.button type="submit" className="ask-send" whileTap={pressTap} aria-label="Send response">
              Send
            </m.button>
          </form>
          <div className="card-hint">Enter to send · types into the pane</div>
        </>
      )}
    </m.div>
  );
}
