/* ══════════════════════════════════════════════════════════════════════════
   LinkCard (Stage widget) — accent-text link + external glyph; click opens the
   URL via commands.openerOpen (Tauri opener plugin → OS browser), NOT webview
   navigation. Card src chip names the surfacing agent.
   ══════════════════════════════════════════════════════════════════════════ */
import { m } from "motion/react";
import { openerOpen } from "../lib/commands";
import { cardMotion } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscLink, StageWidget } from "../lib/contract";

export function LinkCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscLink;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-external" className="icon xs" />Link</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>
      <div className="link-row">
        <button className="link-a" onClick={() => { void openerOpen(p.url); }}>
          <span className="link-txt">{p.url}</span>
          <Icon name="ic-external" className="icon xs" />
        </button>
      </div>
      {p.label && <div className="link-sub">{p.label}</div>}
    </m.div>
  );
}
