/* ══════════════════════════════════════════════════════════════════════════
   MemoryView (§4.6 · U3) — the shared-memory surface: a searchable index on the
   left, the selected entry on the right, with a list⇄graph mode toggle.

   LEFT (index) — a fuzzy search field over useMemory.search(), then entry rows:
   each is the memory name + description + a provenance chip (author seat dot +
   the agent word + the compact updated date). Identity is dot + word, never
   color alone (§13.3). "New" opens the composer in place of the detail.

   RIGHT (detail) — a frontmatter table (name / description / author / dates /
   links) over the body rendered as a monospace well (plain, safe — no markdown
   dep), then Outbound + Backlinks as clickable chips that navigate the graph by
   selecting the target entry. GRAPH mode swaps the left list for <MemoryGraph>,
   which selects into the same detail pane.

   This is a PRODUCT surface: quiet tier, semantic tokens only, embedded chrome
   (no elevation on the panels themselves), motion frequency-gated to none for
   navigation. All hue is seat identity via the shared seatHueFor() resolver.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState, type ReactNode } from "react";
import { m } from "motion/react";
import { pressTap } from "../lib/motion";
import { useMemory, type MemoryEntry } from "../store/memory";
import { useModelHub } from "../store/modelhub";
import { seatHueFor } from "./BoardCard";
import { MemoryGraph } from "./MemoryGraph";
import { Icon } from "./icons";
import "../styles/memory.css";

type Mode = "list" | "graph";

/** Compact provenance date — ISO day, mono, data-surface honest. */
function isoDay(iso: string): string {
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "—";
}

/** Author → one of the eight DESIGN seat hues (seat first, agent as fallback). */
function useSeatHue() {
  const seats = useModelHub((s) => s.seats);
  return (author: MemoryEntry["author"]): string | undefined =>
    seatHueFor(author.seat, seats) ?? seatHueFor(author.agent, seats);
}

/** The provenance chip — seat dot + agent word + updated day (§13.3 identity). */
function Provenance({
  author,
  updated,
  hue,
}: {
  author: MemoryEntry["author"];
  updated: string;
  hue: string | undefined;
}) {
  return (
    <span className="mem-prov" data-seat={hue}>
      <i className="seat-dot" aria-hidden="true" />
      <span className="mem-prov-word seat-label">{author.agent}</span>
      <span className="mem-prov-date tnum">{isoDay(updated)}</span>
    </span>
  );
}

interface ComposerDraft {
  name: string;
  description: string;
  body: string;
  links: string;
}

const EMPTY_DRAFT: ComposerDraft = { name: "", description: "", body: "", links: "" };

export function MemoryView() {
  const index = useMemory((s) => s.index);
  const loaded = useMemory((s) => s.loaded);
  const root = useMemory((s) => s.root);
  const search = useMemory((s) => s.search);
  const write = useMemory((s) => s.write);
  const seatHue = useSeatHue();

  const [mode, setMode] = useState<Mode>("list");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const results = query.trim() ? search(query) : index;
  // Selection resolves against the live index so it survives writes/reloads.
  const selected = selectedName ? index.find((e) => e.name === selectedName) ?? null : null;

  const backlinks = useMemo(
    () =>
      selected
        ? index.filter((e) => e.name !== selected.name && e.links.includes(selected.name))
        : [],
    [index, selected],
  );
  const outbound = useMemo(
    () =>
      selected
        ? selected.links
            .map((link) => index.find((e) => e.name === link))
            .filter((e): e is MemoryEntry => e !== undefined)
        : [],
    [index, selected],
  );

  const openEntry = (name: string) => {
    setSelectedName(name);
    setComposing(false);
    setMode("list"); // selecting (from the list OR a graph node) reveals the detail
  };

  const openComposer = () => {
    setDraft(EMPTY_DRAFT);
    setComposing(true);
    setSelectedName(null);
  };

  const saveDraft = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    const links = draft.links
      .split(/[,\n]/)
      .map((l) => l.trim())
      .filter(Boolean);
    const entry = await write({
      name: draft.name,
      description: draft.description,
      body: draft.body,
      links,
    });
    setSaving(false);
    if (entry) {
      setComposing(false);
      setSelectedName(entry.name);
    }
  };

  return (
    <div className="mem">
      <aside className="mem-index" aria-label="Memory index">
        <header className="mem-index-head">
          <span className="mem-index-title">Memory</span>
          <span className="mem-index-count tnum" aria-label={`${index.length} entries`}>
            {index.length}
          </span>
          <div className="mem-modes" role="tablist" aria-label="Index view">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "list"}
              className={`mem-mode${mode === "list" ? " active" : ""}`}
              onClick={() => setMode("list")}
              title="List"
            >
              <Icon name="ic-roster" size="sm" className="icon" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "graph"}
              className={`mem-mode${mode === "graph" ? " active" : ""}`}
              onClick={() => setMode("graph")}
              title="Graph"
            >
              <Icon name="ic-branch" size="sm" className="icon" />
            </button>
          </div>
          <button type="button" className="mem-new" onClick={openComposer}>
            <Icon name="ic-plus" size="sm" className="icon" />
            New
          </button>
        </header>

        <div className="mem-search">
          <Icon name="ic-search" size="sm" className="icon mem-search-glyph" />
          <input
            className="mem-search-input"
            type="text"
            value={query}
            placeholder="Search memory…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search memory"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {!loaded ? (
          <div className="mem-list-empty">
            {root ? "Loading memory…" : "Open a project to use memory."}
          </div>
        ) : results.length === 0 ? (
          <div className="mem-list-empty">
            {index.length === 0 ? "No memories yet." : "No matches."}
          </div>
        ) : (
          <ul className="mem-list" role="list">
            {results.map((entry) => {
              const hue = seatHue(entry.author);
              return (
                <li key={entry.name} role="listitem">
                  <button
                    type="button"
                    className={`mem-entry${selectedName === entry.name ? " active" : ""}`}
                    onClick={() => openEntry(entry.name)}
                  >
                    <span className="mem-entry-name">{entry.name}</span>
                    {entry.description && (
                      <span className="mem-entry-desc">{entry.description}</span>
                    )}
                    <Provenance author={entry.author} updated={entry.updated} hue={hue} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="mem-detail" aria-label="Memory entry">
        {composing ? (
          <MemoryComposer
            draft={draft}
            saving={saving}
            onChange={setDraft}
            onCancel={() => setComposing(false)}
            onSave={saveDraft}
          />
        ) : mode === "graph" ? (
          <div className="mem-graph-pane">
            <MemoryGraph selected={selectedName} onSelect={openEntry} />
          </div>
        ) : selected ? (
          <article className="mem-doc">
            <header className="mem-doc-head">
              <h1 className="mem-doc-name">{selected.name}</h1>
              <Provenance
                author={selected.author}
                updated={selected.updated}
                hue={seatHue(selected.author)}
              />
            </header>

            <dl className="mem-fm">
              <MemoryField label="Description">
                {selected.description || <span className="mem-muted">(none)</span>}
              </MemoryField>
              <MemoryField label="Author">
                <span className="mem-fm-author">
                  {selected.author.agent}
                  {selected.author.seat && (
                    <span className="mem-fm-seat">· {selected.author.seat}</span>
                  )}
                  <span className="mem-fm-session mono">{selected.author.session}</span>
                </span>
              </MemoryField>
              <MemoryField label="Created">
                <span className="mono">{isoDay(selected.created)}</span>
              </MemoryField>
              <MemoryField label="Updated">
                <span className="mono">{isoDay(selected.updated)}</span>
              </MemoryField>
            </dl>

            <div className="mem-body">
              {selected.body.trim() ? (
                <pre className="mem-body-pre" tabIndex={0}>
                  {selected.body}
                </pre>
              ) : (
                <div className="mem-muted mem-body-empty">Empty document.</div>
              )}
            </div>

            {(outbound.length > 0 || backlinks.length > 0) && (
              <footer className="mem-links">
                {outbound.length > 0 && (
                  <MemoryLinkGroup
                    label="Links to"
                    entries={outbound}
                    seatHue={seatHue}
                    onSelect={openEntry}
                  />
                )}
                {backlinks.length > 0 && (
                  <MemoryLinkGroup
                    label="Linked from"
                    entries={backlinks}
                    seatHue={seatHue}
                    onSelect={openEntry}
                  />
                )}
              </footer>
            )}
          </article>
        ) : (
          <div className="mem-detail-empty">
            <Icon name="ic-markdown" className="icon mem-detail-empty-ic" />
            <span className="mem-detail-empty-title">No memory selected</span>
            <span className="mem-detail-empty-sub">
              Pick an entry on the left, or start a new one.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function MemoryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mem-fm-row">
      <dt className="mem-fm-label">{label}</dt>
      <dd className="mem-fm-val">{children}</dd>
    </div>
  );
}

function MemoryLinkGroup({
  label,
  entries,
  seatHue,
  onSelect,
}: {
  label: string;
  entries: MemoryEntry[];
  seatHue: (author: MemoryEntry["author"]) => string | undefined;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="mem-link-group">
      <span className="mem-link-label">{label}</span>
      <div className="mem-link-chips">
        {entries.map((entry) => (
          <button
            key={entry.name}
            type="button"
            className="mem-link-chip"
            data-seat={seatHue(entry.author)}
            onClick={() => onSelect(entry.name)}
            title={entry.description || entry.name}
          >
            <i className="seat-dot" aria-hidden="true" />
            {entry.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function MemoryComposer({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ComposerDraft;
  saving: boolean;
  onChange: (draft: ComposerDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<ComposerDraft>) => onChange({ ...draft, ...patch });
  return (
    <form
      className="mem-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <header className="mem-composer-head">
        <h1 className="mem-composer-title">New memory</h1>
      </header>

      <label className="mem-field">
        <span className="mem-field-label">Name</span>
        <input
          className="mem-input mono"
          type="text"
          value={draft.name}
          placeholder="short-slug-name"
          onChange={(e) => set({ name: e.target.value })}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </label>

      <label className="mem-field">
        <span className="mem-field-label">Description</span>
        <input
          className="mem-input"
          type="text"
          value={draft.description}
          placeholder="One line — what this note is"
          onChange={(e) => set({ description: e.target.value })}
          autoComplete="off"
        />
      </label>

      <label className="mem-field">
        <span className="mem-field-label">Links</span>
        <input
          className="mem-input mono"
          type="text"
          value={draft.links}
          placeholder="comma-separated slugs"
          onChange={(e) => set({ links: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="mem-field mem-field-grow">
        <span className="mem-field-label">Body</span>
        <textarea
          className="mem-input mem-textarea"
          value={draft.body}
          placeholder="Markdown body…"
          onChange={(e) => set({ body: e.target.value })}
          spellCheck={false}
        />
      </label>

      <footer className="mem-composer-foot">
        <button type="button" className="mem-btn" onClick={onCancel}>
          Cancel
        </button>
        <m.button
          type="submit"
          className="mem-btn primary"
          disabled={!draft.name.trim() || saving}
          whileTap={pressTap}
        >
          {saving ? "Saving…" : "Save memory"}
        </m.button>
      </footer>
    </form>
  );
}
