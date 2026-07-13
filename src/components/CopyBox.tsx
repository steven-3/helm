/* ══════════════════════════════════════════════════════════════════════════
   CopyBox (Stage widget) — click copies payload.text via commands.clipboardWrite
   (Tauri clipboard plugin) and shows transient "copied" feedback (check glyph +
   success hint, ~1.2s). Card src chip names the surfacing agent.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import { clipboardWrite } from "../lib/commands";
import { cardMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscCopy, StageWidget } from "../lib/contract";

export function CopyBox({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscCopy;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await clipboardWrite(p.text);
    } catch {
      /* clipboard plugin unavailable (browser dev) — still show feedback */
    }
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1200);
  };

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-copy" className="icon xs" />Copy</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>
      <m.div
        className="copy-field"
        role="button"
        tabIndex={0}
        aria-label={`Copy ${p.label ?? "value"}`}
        onClick={copy}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(); } }}
        whileTap={pressTap}
      >
        <span className="copy-val tnum">{p.text}</span>
        <span className={`copy-btn${done ? " done" : ""}`} aria-hidden="true">
          <Icon name={done ? "ic-check" : "ic-copy"} className="icon xs" />
        </span>
      </m.div>
      <div className={`card-hint${done ? " done" : ""}`}>
        {done ? "copied to clipboard" : p.label ? `${p.label} · click to copy` : "click to copy"}
      </div>
    </m.div>
  );
}
