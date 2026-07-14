/* ══════════════════════════════════════════════════════════════════════════
   JsonCard (Stage widget) — an OscJson: the payload's JSON string re-serialised
   with 2-space indent in a recessed, scrollable mono well, with a copy button
   (reuses commands.clipboardWrite, like CopyBox).

   SECURITY: the JSON is agent-supplied. It is NEVER injected as HTML — the tiny
   tokenizer emits typed spans as React TEXT nodes (auto-escaped), so a value like
   `"</span>"` is literal text, not markup. The three tints (keys / strings /
   numbers) deliberately reuse helm's terminal ANSI hues (indigo / green / amber,
   §5) so JSON reads as one system with the terminal — colour as function (§2·3),
   not decoration.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import { clipboardWrite } from "../lib/commands";
import { cardMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscJson, StageWidget } from "../lib/contract";

type Seg = { t: string; c?: "j-key" | "j-str" | "j-num" | "j-lit" };

/* Split pretty JSON into typed segments. A single pass matches strings / literals
   / numbers; the text BETWEEN matches (whitespace, braces, colons, commas) is
   emitted as neutral spans. A matched string is a KEY when the next non-space
   char is a colon, else a value. Bounded input (osc.ts caps json ≤32 KiB). */
function tokenizeJson(src: string): Seg[] {
  const re = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const segs: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) segs.push({ t: src.slice(last, m.index) });
    const tok = m[0];
    let c: Seg["c"];
    if (tok[0] === '"') c = /^\s*:/.test(src.slice(re.lastIndex)) ? "j-key" : "j-str";
    else if (tok === "true" || tok === "false" || tok === "null") c = "j-lit";
    else c = "j-num";
    segs.push({ t: tok, c });
    last = re.lastIndex;
  }
  if (last < src.length) segs.push({ t: src.slice(last) });
  return segs;
}

export function JsonCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscJson;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced

  // osc.ts already guarantees p.json parses; re-serialise for stable 2-space
  // indentation. Defensive fallback keeps the raw text if anything is off.
  let pretty = p.json;
  try {
    pretty = JSON.stringify(JSON.parse(p.json), null, 2);
  } catch {
    /* keep raw text — never throw into the render loop */
  }
  const segs = tokenizeJson(pretty);

  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await clipboardWrite(pretty);
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
        <span className="card-kind"><Icon name="ic-braces" className="icon xs" />JSON</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      <div className="json-wrap">
        <m.button
          type="button"
          className={`json-copy${done ? " done" : ""}`}
          onClick={copy}
          whileTap={pressTap}
          aria-label={done ? "Copied JSON to clipboard" : "Copy JSON"}
        >
          <Icon name={done ? "ic-check" : "ic-copy"} className="icon xs" />
        </m.button>
        <pre className="json-pre" tabIndex={0}><code>
          {segs.map((s, i) => (s.c ? <span key={i} className={s.c}>{s.t}</span> : s.t))}
        </code></pre>
      </div>

      <div className={`card-hint${done ? " done" : ""}`}>
        {done ? "copied to clipboard" : p.label ? `${p.label} · JSON` : "JSON"}
      </div>
    </m.div>
  );
}
