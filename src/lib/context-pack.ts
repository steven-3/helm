/* ══════════════════════════════════════════════════════════════════════════
   context-pack.ts — §3.5: the markdown briefing written to .helm/tasks/<id>.md
   before an agent is dispatched. Every pack embeds:
     • the task (title / body / acceptance / files),
     • an excerpt of the shared memory INDEX (§5.3 — memory read by default),
     • `helm task` shim usage so the agent can report progress/done/blocked.
   Pure builder + one IPC write. No store imports (dispatch/swarm/board layer
   on top of this without cycles).
   ══════════════════════════════════════════════════════════════════════════ */
import { helmStoreRead, helmStoreWrite } from "./ipc";

export interface ContextPackInput {
  /** Task/card id — also the id the agent reports with (`helm task done <id>`). */
  id: string;
  title: string;
  body: string;
  /** Optional acceptance criteria bullets. */
  acceptance?: string[];
  /** Files the task expects to touch (ownership hint). */
  files?: string[];
  /** Seat label, purely informational in the pack header. */
  seat?: string;
  /** Extra sections (swarm role prompts, mailbox conventions). */
  extraSections?: { heading: string; body: string }[];
}

/** Max lines of memory INDEX embedded — keeps packs small and readable. */
const INDEX_EXCERPT_LINES = 30;

/** Sanitize an id for a filename: conservative slug, collision-safe enough
    because card/task ids are already unique. */
export function taskFileRelPath(id: string): string {
  const slug = id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "task";
  return `tasks/${slug}.md`;
}

export function buildContextPack(input: ContextPackInput, memoryIndexExcerpt: string | null): string {
  const lines: string[] = [];
  lines.push(`# Task: ${input.title}`);
  lines.push("");
  lines.push(`- id: \`${input.id}\``);
  if (input.seat) lines.push(`- seat: ${input.seat}`);
  lines.push("");
  lines.push("## Brief");
  lines.push("");
  lines.push(input.body.trim() || "(no further description)");
  lines.push("");

  if (input.acceptance && input.acceptance.length > 0) {
    lines.push("## Acceptance");
    lines.push("");
    for (const item of input.acceptance) lines.push(`- [ ] ${item}`);
    lines.push("");
  }

  if (input.files && input.files.length > 0) {
    lines.push("## Files in scope");
    lines.push("");
    for (const file of input.files) lines.push(`- \`${file}\``);
    lines.push("");
  }

  for (const section of input.extraSections ?? []) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    lines.push(section.body.trim());
    lines.push("");
  }

  if (memoryIndexExcerpt && memoryIndexExcerpt.trim().length > 0) {
    lines.push("## Shared memory index (excerpt)");
    lines.push("");
    lines.push("Relevant entries live in `.helm/memory/<name>.md` — read before working.");
    lines.push("");
    lines.push(memoryIndexExcerpt.trim());
    lines.push("");
  }

  lines.push("## Reporting (required)");
  lines.push("");
  lines.push("Use the `helm` CLI (already on PATH inside this pane) to report:");
  lines.push("");
  lines.push("```");
  lines.push(`helm task progress ${input.id} -m "what you just did"`);
  lines.push(`helm task done ${input.id} [-m "receipt"]`);
  lines.push(`helm task blocked ${input.id} -m "what you need"`);
  lines.push(`helm memory add <name> --desc "one-liner" [--links a,b]`);
  lines.push("```");
  lines.push("");
  lines.push("Report `done` only after your change is verified.");
  lines.push("");
  return lines.join("\n");
}

/** Head excerpt of .helm/memory/INDEX.md; null when the index doesn't exist. */
export async function readMemoryIndexExcerpt(projectRoot: string): Promise<string | null> {
  try {
    const index = await helmStoreRead(projectRoot, "memory/INDEX.md");
    const lines = index.split("\n");
    const excerpt = lines.slice(0, INDEX_EXCERPT_LINES).join("\n");
    return lines.length > INDEX_EXCERPT_LINES ? `${excerpt}\n… (index truncated)` : excerpt;
  } catch {
    return null; // no memory yet — the pack simply omits the section
  }
}

/** Build + write the pack. Returns the path RELATIVE to `.helm/` (contract:
    prompts reference `.helm/${relPath}`). */
export async function writeContextPack(
  projectRoot: string,
  input: ContextPackInput,
): Promise<string> {
  const excerpt = await readMemoryIndexExcerpt(projectRoot);
  const relPath = taskFileRelPath(input.id);
  await helmStoreWrite(projectRoot, relPath, buildContextPack(input, excerpt));
  return relPath;
}
