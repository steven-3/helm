import { useEffect, useRef, useState } from "react";
import { shellQuote, agentKindForModel, useModelHub } from "../store/modelhub";
import { TAB_ACCENT_SLOTS, type TabAccent, usePanes } from "../store/panes";
import { useEnv } from "../store/env";
import { useExplorer } from "../store/explorer";
import { useCustomAgents, type CustomAgent } from "../store/customAgents";
import { Icon } from "./icons";
import { Dropdown } from "./ui/Dropdown";
import "../styles/wiring.css";

export interface AgentsPageProps { open: boolean; onClose: () => void; root?: string }
const blank = { name: "", seat: "orchestrator", launcher: "", systemPrompt: "", color: "indigo" };

function projectRoot(override?: string): string | null {
  if (override) return override;
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  return useExplorer.getState().root ?? (tab ? state.panes[tab.activePaneId]?.cwd : null) ?? useEnv.getState().cwd;
}

function spawnAgent(agent: CustomAgent, root?: string): void {
  const hub = useModelHub.getState();
  const launcher = hub.launcherFor(agent.seat);
  const base = agent.launcher.trim() || launcher.command;
  const command = agent.systemPrompt.trim() ? `${base} ${shellQuote(agent.systemPrompt.trim())}` : base;
  const cwd = projectRoot(root) ?? undefined;
  const tabId = usePanes.getState().addTab({
    agent: agentKindForModel(launcher.model),
    model: launcher.model ?? undefined,
    command,
    launchViaShell: true,
    cwd,
    title: agent.name,
    tabTitle: agent.name,
  });
  if (TAB_ACCENT_SLOTS.includes(agent.color as TabAccent)) usePanes.getState().setTabColor(tabId, agent.color as TabAccent);
}

export function AgentsPage({ open, onClose, root }: AgentsPageProps) {
  const agents = useCustomAgents((state) => state.agents);
  const loaded = useCustomAgents((state) => state.loaded);
  const seats = useModelHub((state) => state.seats);
  const dialogRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(blank);

  useEffect(() => {
    if (!open) return;
    const resolved = projectRoot(root);
    if (resolved) void useCustomAgents.getState().load(resolved);
  }, [open, root]);
  useEffect(() => {
    if (!selectedId || !agents.some((agent) => agent.id === selectedId)) setSelectedId(agents[0]?.id ?? null);
  }, [agents, selectedId]);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const edit = (agent?: CustomAgent) => {
    setEditingId(agent?.id ?? "new");
    setDraft(agent ? { name: agent.name, seat: agent.seat, launcher: agent.launcher, systemPrompt: agent.systemPrompt, color: agent.color } : blank);
  };
  const save = () => {
    if (editingId === "new") setSelectedId(useCustomAgents.getState().add(draft));
    else if (editingId) useCustomAgents.getState().update(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="wire-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="wire-modal agents-page elev-3" role="dialog" aria-modal="true" aria-labelledby="agents-title" tabIndex={-1} ref={dialogRef}>
        <header className="wire-head"><div><span className="wire-kicker">Fleet configuration</span><h2 id="agents-title">Custom agents</h2></div><button className="wire-icon-button" type="button" aria-label="Close agents page" onClick={onClose}><Icon name="ic-close" size="sm" /></button></header>
        <div className="wire-toolbar"><p>Saved in <code>.helm/agents.json</code> for this project.</p><button className="wire-button primary" type="button" onClick={() => edit()}><Icon name="ic-plus" size="xs" />New agent</button></div>
        <div className="wire-split">
          <div className="wire-list" role="listbox" aria-label="Custom agents">
            {!loaded && <div className="wire-empty">Loading agents…</div>}
            {loaded && agents.length === 0 && <div className="wire-empty">No custom agents yet.</div>}
            {agents.map((agent) => <button type="button" role="option" aria-selected={selectedId === agent.id} className={`wire-list-row agent-row${selectedId === agent.id ? " active" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)}><i className="wire-color-dot" data-color={agent.color} /><strong>{agent.name}</strong><span>{agent.seat}</span></button>)}
          </div>
          <div className="wire-detail">
            {editingId ? <form className="wire-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
              <label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Seat<Dropdown value={draft.seat} options={Object.keys(seats).map((seat) => ({ value: seat, label: seat, description: seats[seat] || undefined }))} onChange={(seat) => setDraft({ ...draft, seat })} ariaLabel="Seat" /></label>
              <label>Launcher override<input value={draft.launcher} onChange={(event) => setDraft({ ...draft, launcher: event.target.value })} placeholder="Use the Model Hub launcher" /></label>
              <fieldset className="wire-colors"><legend>Color slot</legend>{TAB_ACCENT_SLOTS.map((color) => <button key={color} type="button" className={draft.color === color ? "selected" : ""} aria-label={color} aria-pressed={draft.color === color} data-color={color} onClick={() => setDraft({ ...draft, color })} />)}</fieldset>
              <label className="grow">System prompt<textarea value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} placeholder="Instructions passed when this agent launches" /></label>
              <div className="wire-actions"><button className="wire-button" type="button" onClick={() => setEditingId(null)}>Cancel</button><button className="wire-button primary" type="submit">Save agent</button></div>
            </form> : selected ? <>
              <div className="wire-detail-head"><div><span className="wire-kicker">{selected.seat}</span><h3>{selected.name}</h3></div><div className="wire-actions"><button className="wire-button" type="button" onClick={() => edit(selected)}><Icon name="ic-pencil" size="xs" />Edit</button><button className="wire-button danger" type="button" onClick={() => useCustomAgents.getState().remove(selected.id)}>Delete</button></div></div>
              <dl className="wire-facts"><div><dt>Launcher</dt><dd>{selected.launcher || "Model Hub default"}</dd></div><div><dt>Color</dt><dd><i className="wire-color-dot" data-color={selected.color} />{selected.color}</dd></div></dl>
              <pre className="wire-preview">{selected.systemPrompt || "No system prompt configured."}</pre>
              <div className="wire-actions push"><button className="wire-button primary" type="button" onClick={() => spawnAgent(selected, root)}><Icon name="ic-plus" size="xs" />New pane with this agent</button></div>
            </> : <div className="wire-empty">Create an agent configuration for this project.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
