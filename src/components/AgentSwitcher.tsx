/* ══════════════════════════════════════════════════════════════════════════
   AgentSwitcher — the per-pane model/agent chip (ARCHITECTURE §6). v1 semantics:
   the switcher sets the pane's LAUNCH command; switching = a new session in that
   pane (CLIs don't hot-swap models mid-session) → usePanes.setPaneAgent. Menu is
   an e3 popover (transform-origin top-left, scale .97→1 entrance, §8 standard
   motion — a switcher is occasional, not high-frequency). Closes on outside-click
   and Escape.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { usePanes } from "../store/panes";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { AgentKind } from "../lib/contract";

interface Option { agent: AgentKind; model: string; command: string }
const OPTIONS: Option[] = [
  { agent: "claude", model: "opus-4.8", command: "claude" },
  { agent: "codex", model: "gpt-5.6", command: "codex" },
  { agent: "shell", model: "bash", command: "bash" },
];

const glyphColor = (key: "cl" | "cx" | "gn") =>
  key === "cl" ? "var(--agent-claude-text)" : key === "cx" ? "var(--agent-codex-text)" : "var(--text-secondary)";

export function AgentSwitcher({ paneId, agent, model }: { paneId: string; agent: AgentKind; model?: string }) {
  const setPaneAgent = usePanes((s) => s.setPaneAgent);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const vis = agentVis(agent, model);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (o: Option) => {
    setPaneAgent(paneId, o.agent, o.model, o.command);
    setOpen(false);
  };

  return (
    <div className="sw-wrap" ref={wrapRef}>
      <button
        className={`switcher ${vis.key}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={vis.glyph} size="xs" style={{ color: glyphColor(vis.key) }} />
        <span className="sw-agent">{vis.word}</span>
        <Icon name="ic-caret" className="sw-caret icon xs" style={{ width: 11, height: 11 }} />
        {model && <span className="sw-model">{model}</span>}
      </button>

      {open && (
        <div className="sw-menu" role="menu" aria-label="Choose agent + model">
          <div className="sw-menu-label">SESSION</div>
          {OPTIONS.map((o) => {
            const ov = agentVis(o.agent, o.model);
            const on = o.agent === agent && o.model === model;
            return (
              <button
                key={o.agent + o.model}
                role="menuitem"
                className={`sw-item ${ov.key}${on ? " on" : ""}`}
                onClick={() => choose(o)}
              >
                <Icon name={ov.glyph} size="xs" style={{ color: glyphColor(ov.key) }} />
                <span className="sw-i-agent">{ov.word}</span>
                <span className="sw-i-model">{o.model}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
