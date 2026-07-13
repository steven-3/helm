/* ══════════════════════════════════════════════════════════════════════════
   Pane — one terminal pane: agent-colour top accent (dims when unfocused),
   pane-head (AgentSwitcher · run indicator · split/close tools), and the xterm
   host. Clicking anywhere focuses the pane (usePanes.focusPane). The run
   indicator mirrors pane.state (running = agent colour + pulse; needs-input =
   amber + pulse; error = danger) — always icon/dot + word, never colour alone.
   ══════════════════════════════════════════════════════════════════════════ */
import { usePanes } from "../store/panes";
import { agentVis } from "./agent-view";
import { AgentSwitcher } from "./AgentSwitcher";
import { TerminalPane, type TerminalPaneProps } from "./TerminalPane";
import { Icon } from "./icons";
import type { Pane as PaneModel } from "../lib/contract";

const paneAgentClass = (agent: PaneModel["agent"]) =>
  agent === "claude" ? "claude" : agent === "codex" ? "codex" : "shell";

function RunIndicator({ pane }: { pane: PaneModel }) {
  const key = agentVis(pane.agent).key;
  if (pane.state === "running") {
    return (
      <span className={`pane-run ${key === "cx" ? "cx" : key === "cl" ? "cl" : "idle"}`}>
        <i className={`sdot ${key} pulse`} />running
      </span>
    );
  }
  if (pane.state === "needs-input") {
    return (
      <span className="pane-run attn">
        <Icon name="ic-alert" className="icon xs pulse" />needs input
      </span>
    );
  }
  if (pane.state === "error") {
    return (
      <span className="pane-run err">
        <Icon name="ic-alert" className="icon xs" />error
      </span>
    );
  }
  return null;
}

export function Pane({
  pane,
  onTermReady,
}: {
  pane: PaneModel;
  onTermReady?: TerminalPaneProps["onReady"];
}) {
  const focusPane = usePanes((s) => s.focusPane);
  const splitPane = usePanes((s) => s.splitPane);
  const closePane = usePanes((s) => s.closePane);

  return (
    <section
      className={`pane ${paneAgentClass(pane.agent)}${pane.focused ? " focused" : ""}`}
      aria-label={`${pane.agent} pane · ${pane.title}`}
      onMouseDown={() => { if (!pane.focused) focusPane(pane.id); }}
    >
      <div className="pane-accent" />
      <div className="pane-head">
        <AgentSwitcher paneId={pane.id} agent={pane.agent} model={pane.model} />
        <div className="pane-head-right">
          <RunIndicator pane={pane} />
          <span className="pane-tools">
            <button
              aria-label="Split pane"
              onClick={(e) => {
                e.stopPropagation();
                splitPane(pane.tabId, "vertical", { agent: "shell", model: "bash", title: "shell", command: "bash", cwd: pane.cwd });
              }}
            >
              <Icon name="ic-split" className="icon xs" />
            </button>
            <button
              aria-label="Close pane"
              onClick={(e) => { e.stopPropagation(); closePane(pane.id); }}
            >
              <Icon name="ic-close" className="icon xs" />
            </button>
          </span>
        </div>
      </div>
      <TerminalPane paneId={pane.id} agent={pane.agent} focused={pane.focused} onReady={onTermReady} />
    </section>
  );
}
