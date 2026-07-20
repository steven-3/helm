import { useEffect, useMemo, useState } from "react";
import { fuzzyScore } from "../lib/fuzzy";
import { ptyWrite } from "../lib/commands";
import { useEnv } from "../store/env";
import { useExplorer } from "../store/explorer";
import { usePanes } from "../store/panes";
import { usePrompts, type SavedPrompt } from "../store/prompts";
import { Icon } from "./icons";
import "../styles/wiring.css";

export interface PromptsLibraryProps {
  open: boolean;
  onClose: () => void;
  root?: string;
}

function activeRoot(override?: string): string | null {
  if (override) return override;
  const panes = usePanes.getState();
  const tab = panes.tabs.find((item) => item.id === panes.activeTabId);
  return useExplorer.getState().root ?? (tab ? panes.panes[tab.activePaneId]?.cwd : null) ?? useEnv.getState().cwd;
}

async function insertIntoActivePane(body: string): Promise<boolean> {
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  const paneId = tab?.activePaneId;
  if (!paneId || !state.panes[paneId]) return false;
  try {
    await ptyWrite(paneId, body);
    return true;
  } catch {
    return false;
  }
}

const blank = { title: "", body: "", tags: "" };

export function PromptsLibrary({ open, onClose, root }: PromptsLibraryProps) {
  const prompts = usePrompts((state) => state.prompts);
  const loaded = usePrompts((state) => state.loaded);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(blank);

  useEffect(() => {
    if (!open) return;
    const projectRoot = activeRoot(root);
    if (projectRoot) void usePrompts.getState().load(projectRoot);
    setQuery("");
  }, [open, root]);

  useEffect(() => {
    if (!selectedId || !prompts.some((prompt) => prompt.id === selectedId)) {
      setSelectedId(prompts[0]?.id ?? null);
    }
  }, [prompts, selectedId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const visible = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return prompts;
    return prompts
      .map((prompt) => ({ prompt, score: fuzzyScore(trimmed, `${prompt.title} ${prompt.tags.join(" ")} ${prompt.body}`) }))
      .filter((item): item is { prompt: SavedPrompt; score: number } => item.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.prompt);
  }, [prompts, query]);

  if (!open) return null;
  const selected = prompts.find((prompt) => prompt.id === selectedId) ?? null;
  const beginNew = () => { setEditingId("new"); setDraft(blank); };
  const beginEdit = (prompt: SavedPrompt) => {
    setEditingId(prompt.id);
    setDraft({ title: prompt.title, body: prompt.body, tags: prompt.tags.join(", ") });
  };
  const save = () => {
    const input = { title: draft.title, body: draft.body, tags: draft.tags.split(",") };
    if (editingId === "new") {
      const id = usePrompts.getState().add(input);
      setSelectedId(id);
    } else if (editingId) {
      usePrompts.getState().update(editingId, input);
    }
    setEditingId(null);
  };

  return (
    <div className="wire-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="wire-modal prompts-library elev-3" role="dialog" aria-modal="true" aria-labelledby="prompts-title">
        <header className="wire-head">
          <div><span className="wire-kicker">Reusable instructions</span><h2 id="prompts-title">Prompts library</h2></div>
          <button className="wire-icon-button" type="button" aria-label="Close prompts library" onClick={onClose}><Icon name="ic-close" size="sm" /></button>
        </header>
        <div className="wire-toolbar">
          <label className="wire-search"><Icon name="ic-search" size="sm" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prompts and tags" /></label>
          <button className="wire-button primary" type="button" onClick={beginNew}><Icon name="ic-plus" size="xs" />New prompt</button>
        </div>
        <div className="wire-split">
          <div className="wire-list" role="listbox" aria-label="Saved prompts">
            {!loaded && <div className="wire-empty">Loading prompts…</div>}
            {loaded && visible.length === 0 && <div className="wire-empty">No matching prompts.</div>}
            {visible.map((prompt) => (
              <button key={prompt.id} type="button" role="option" aria-selected={prompt.id === selectedId} className={`wire-list-row${prompt.id === selectedId ? " active" : ""}`} onClick={() => setSelectedId(prompt.id)}>
                <strong>{prompt.title}</strong><span>{prompt.body.replace(/\s+/g, " ").slice(0, 82)}</span>
                {prompt.tags.length > 0 && <small>{prompt.tags.map((tag) => `#${tag}`).join("  ")}</small>}
              </button>
            ))}
          </div>
          <div className="wire-detail">
            {editingId ? (
              <form className="wire-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
                <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
                <label>Tags<input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="review, planning, refactor" /></label>
                <label className="grow">Prompt<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} required /></label>
                <div className="wire-actions"><button type="button" className="wire-button" onClick={() => setEditingId(null)}>Cancel</button><button type="submit" className="wire-button primary">Save prompt</button></div>
              </form>
            ) : selected ? (
              <>
                <div className="wire-detail-head"><div><span className="wire-kicker">Preview</span><h3>{selected.title}</h3></div><div className="wire-actions"><button className="wire-button" type="button" onClick={() => beginEdit(selected)}><Icon name="ic-pencil" size="xs" />Edit</button><button className="wire-button danger" type="button" onClick={() => { usePrompts.getState().remove(selected.id); setSelectedId(null); }}>Delete</button></div></div>
                <pre className="wire-preview">{selected.body}</pre>
                <div className="wire-actions push"><button className="wire-button primary" type="button" onClick={() => void insertIntoActivePane(selected.body)}>Insert into active pane</button></div>
              </>
            ) : <div className="wire-empty">Create a prompt to reuse it across sessions.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
