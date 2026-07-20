/* ══════════════════════════════════════════════════════════════════════════
   useMemory — shared agent memory (§4.6): plain markdown files under
   .helm/memory/*.md with frontmatter (name, description, links[], author,
   created, updated), an auto-regenerated INDEX.md, a link graph with
   backlinks, and provenance stamped on every entry (§5.3).

   Subscribes to the memory.write bridge verb so `helm memory add` lands here
   mid-run; MCP tools (shim/helm-mcp.mjs, workstream A) read the same files.
   Frontmatter is parsed with a small tolerant reader — files are git-friendly
   and hand-editable; unparseable files surface with defaults, never crash.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { fuzzyScore } from "../lib/fuzzy";
import {
  helmStoreList,
  helmStoreRead,
  helmStoreWrite,
  onMemoryWrite,
  type MemoryWriteVerb,
} from "../lib/ipc";
import { usePanes } from "./panes";

export interface MemoryProvenance {
  /** Agent kind of the writing pane ("claude", "codex", "shell", "user"…). */
  agent: string;
  /** Model Hub seat, when known. */
  seat?: string;
  /** Session (= paneId) that wrote the entry; "user" for manual writes. */
  session: string;
}

export interface MemoryEntry {
  /** Slug — also the filename: .helm/memory/<name>.md. */
  name: string;
  description: string;
  links: string[];
  author: MemoryProvenance;
  /** ISO timestamps. */
  created: string;
  updated: string;
  /** Markdown body below the frontmatter. */
  body: string;
}

export interface MemoryGraph {
  nodes: { id: string; description: string; updated: string }[];
  edges: { from: string; to: string }[];
}

export interface MemoryWriteInput {
  name: string;
  description: string;
  links?: string[];
  body?: string;
  /** Provided by callers that know better (verb handler); defaults to "user". */
  author?: Partial<MemoryProvenance>;
}

interface MemoryState {
  root: string | null;
  /** All entries, most recently updated first. */
  index: MemoryEntry[];
  loaded: boolean;

  /** Activate a project: scan .helm/memory/ and parse every entry. */
  load: (root: string) => Promise<void>;
  /** Fuzzy search over name + description + body head. */
  search: (q: string) => MemoryEntry[];
  /** Nodes + edges from links[] (backlinks are just reversed edges in UI). */
  graph: () => MemoryGraph;
  /** Create/update an entry (provenance stamped), regenerate INDEX.md. */
  write: (entry: MemoryWriteInput) => Promise<MemoryEntry | null>;
}

export const memorySlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "note";

/* ── frontmatter (tolerant reader/writer — files are hand-editable) ───────── */

function serializeEntry(entry: MemoryEntry): string {
  const lines = [
    "---",
    `name: ${entry.name}`,
    `description: ${entry.description.replace(/\n/g, " ")}`,
    `links: [${entry.links.join(", ")}]`,
    `author: {agent: ${entry.author.agent}, seat: ${entry.author.seat ?? ""}, session: ${entry.author.session}}`,
    `created: ${entry.created}`,
    `updated: ${entry.updated}`,
    "---",
    "",
  ];
  return lines.join("\n") + (entry.body ? `${entry.body.trim()}\n` : "");
}

function parseInlineAuthor(value: string): MemoryProvenance {
  const author: MemoryProvenance = { agent: "unknown", session: "unknown" };
  const inner = value.replace(/^\{|\}$/g, "");
  for (const pair of inner.split(",")) {
    const colon = pair.indexOf(":");
    if (colon < 0) continue;
    const key = pair.slice(0, colon).trim();
    const val = pair.slice(colon + 1).trim();
    if (key === "agent" && val) author.agent = val;
    else if (key === "seat" && val) author.seat = val;
    else if (key === "session" && val) author.session = val;
  }
  return author;
}

export function parseMemoryFile(name: string, raw: string): MemoryEntry {
  const fallbackTs = new Date(0).toISOString();
  const entry: MemoryEntry = {
    name,
    description: "",
    links: [],
    author: { agent: "unknown", session: "unknown" },
    created: fallbackTs,
    updated: fallbackTs,
    body: raw.trim(),
  };
  if (!raw.startsWith("---")) return entry;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return entry;

  const head = raw.slice(3, end);
  entry.body = raw.slice(end + 4).replace(/^\r?\n/, "").trim();
  for (const line of head.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    switch (key) {
      case "name":
        if (value) entry.name = value;
        break;
      case "description":
        entry.description = value;
        break;
      case "links":
        entry.links = value
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((link) => link.trim())
          .filter(Boolean);
        break;
      case "author":
        entry.author = parseInlineAuthor(value);
        break;
      case "created":
        if (value) entry.created = value;
        break;
      case "updated":
        if (value) entry.updated = value;
        break;
    }
  }
  return entry;
}

/* ── INDEX.md — one line per memory, §3.1 ─────────────────────────────────── */

export function buildIndexMd(entries: MemoryEntry[]): string {
  const lines = ["# Memory index", ""];
  for (const entry of entries) {
    const links = entry.links.length > 0 ? ` — links: ${entry.links.join(", ")}` : "";
    lines.push(`- [${entry.name}](${entry.name}.md) — ${entry.description || "(no description)"}${links}`);
  }
  lines.push("");
  return lines.join("\n");
}

const byUpdatedDesc = (a: MemoryEntry, b: MemoryEntry) =>
  b.updated.localeCompare(a.updated);

function provenanceFromPane(paneId: string | undefined): MemoryProvenance {
  const pane = paneId ? usePanes.getState().panes[paneId] : undefined;
  if (!pane) return { agent: "user", session: "user" };
  return { agent: pane.agent, session: pane.id };
}

export const useMemory = create<MemoryState>((set, get) => ({
  root: null,
  index: [],
  loaded: false,

  load: async (root) => {
    set({ root, loaded: false });
    try {
      const files = await helmStoreList(root, "memory");
      const entries: MemoryEntry[] = [];
      for (const file of files) {
        if (file.dir || !file.name.endsWith(".md") || file.name === "INDEX.md") continue;
        try {
          const raw = await helmStoreRead(root, `memory/${file.name}`);
          entries.push(parseMemoryFile(file.name.replace(/\.md$/, ""), raw));
        } catch {
          // One unreadable file never hides the rest of the memory.
        }
      }
      if (get().root !== root) return; // a newer project load superseded this one
      set({ index: entries.sort(byUpdatedDesc), loaded: true });
    } catch {
      // No memory dir yet — empty index for this project.
      if (get().root !== root) return;
      set({ index: [], loaded: true });
    }
  },

  search: (q) => {
    const { index } = get();
    const query = q.trim();
    if (!query) return index;
    return index
      .map((entry) => {
        const haystack = `${entry.name} ${entry.description} ${entry.body.slice(0, 400)}`;
        const score = fuzzyScore(query, haystack);
        return score === null ? null : { entry, score };
      })
      .filter((hit): hit is { entry: MemoryEntry; score: number } => hit !== null)
      .sort((a, b) => b.score - a.score)
      .map((hit) => hit.entry);
  },

  graph: () => {
    const { index } = get();
    const known = new Set(index.map((entry) => entry.name));
    const nodes = index.map((entry) => ({
      id: entry.name,
      description: entry.description,
      updated: entry.updated,
    }));
    const edges: MemoryGraph["edges"] = [];
    for (const entry of index) {
      for (const link of entry.links) {
        const target = memorySlug(link);
        if (known.has(target) && target !== entry.name) {
          edges.push({ from: entry.name, to: target });
        }
      }
    }
    return { nodes, edges };
  },

  write: async (input) => {
    const root = get().root;
    if (!root) return null;
    const name = memorySlug(input.name);
    const now = new Date().toISOString();
    const existing = get().index.find((entry) => entry.name === name);

    const entry: MemoryEntry = {
      name,
      description: input.description.trim(),
      links: (input.links ?? []).map(memorySlug).filter(Boolean),
      author: {
        agent: input.author?.agent ?? "user",
        seat: input.author?.seat,
        session: input.author?.session ?? "user",
      },
      created: existing?.created ?? now,
      updated: now,
      // An update without a body keeps the existing prose (verbs may only
      // refresh description/links).
      body: input.body?.trim() ?? existing?.body ?? "",
    };

    try {
      await helmStoreWrite(root, `memory/${name}.md`, serializeEntry(entry));
    } catch {
      return null; // write failed — never advertise a phantom entry in the index
    }

    const index = [entry, ...get().index.filter((item) => item.name !== name)].sort(byUpdatedDesc);
    set({ index });
    // INDEX.md regen is best-effort; the files remain the source of truth.
    void helmStoreWrite(root, "memory/INDEX.md", buildIndexMd(index)).catch(() => {});
    return entry;
  },
}));

/* ── memory.write bridge verb (`helm memory add …`) ───────────────────────── */
function handleMemoryWrite(verb: MemoryWriteVerb): void {
  const state = useMemory.getState();
  if (!state.root) return; // no active project — nowhere to write
  void state.write({
    name: verb.name,
    description: verb.desc ?? "",
    links: verb.links,
    body: verb.body,
    author: provenanceFromPane(verb.paneId),
  });
}

onMemoryWrite(handleMemoryWrite);
