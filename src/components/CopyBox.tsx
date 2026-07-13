/* ══════════════════════════════════════════════════════════════════════════
   CopyBox (Stage widget) — click copies payload.text via commands.clipboardWrite
   (Tauri clipboard plugin) and shows transient "copied" feedback (check glyph +
   success hint, ~1.2s). Card src chip names the surfacing agent.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { clipboardWrite } from "../lib/commands";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscCopy, StageWidget } from "../lib/contract";

export function CopyBox({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscCopy;
  const src = agentVis(widget.agent);
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
    <div className="card">
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-copy" className="icon xs" />COPY</span>
        <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
      </div>
      <div
        className="copy-field"
        role="button"
        tabIndex={0}
        aria-label={`Copy ${p.label ?? "value"}`}
        onClick={copy}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(); } }}
      >
        <span className="copy-val tnum">{p.text}</span>
        <span className={`copy-btn${done ? " done" : ""}`} aria-hidden="true">
          <Icon name={done ? "ic-check" : "ic-copy"} className="icon xs" />
        </span>
      </div>
      <div className={`card-hint${done ? " done" : ""}`}>
        {done ? "copied to clipboard" : p.label ? `${p.label} · click to copy` : "click to copy"}
      </div>
    </div>
  );
}
