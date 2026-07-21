/* ══════════════════════════════════════════════════════════════════════════
   prompt-improver.ts — voice transcript → crisp agent prompt (§3.4 useVoice),
   plus the shared chat-completion helper the flight recorder reuses for
   digest summaries (§4.9).

   Transport: OpenAI-compatible POST /v1/chat/completions through the Rust
   proxy_http command (CLIProxyAPI on loopback). HARD FALLBACK contract: any
   failure — proxy down, non-2xx, malformed JSON, empty content — returns the
   raw transcript (improve) or null (chatComplete). Never throws to callers.
   ══════════════════════════════════════════════════════════════════════════ */
import { proxyHttp } from "./ipc";

const CHAT_COMPLETE_TIMEOUT_MS = 30_000;

function abortSignalPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => reject(new Error("chat completion timed out"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export interface ChatCompleteOpts {
  proxyUrl: string;
  model: string;
  system: string;
  user: string;
  /** Bearer token, when the proxy requires one. */
  authToken?: string;
  maxTokens?: number;
  temperature?: number;
  /** Passed through as `reasoning_effort` — proxies forward it; models that
      don't support it ignore it harmlessly. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Overrides the default 30s abort timeout. */
  timeoutMs?: number;
}

/** One-shot chat completion via proxy_http. Resolves null on ANY failure. */
export async function chatComplete(opts: ChatCompleteOpts): Promise<string | null> {
  try {
    const url = `${opts.proxyUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? CHAT_COMPLETE_TIMEOUT_MS,
    );
    let response;
    try {
      response = await Promise.race([
        proxyHttp(
          "POST",
          url,
          headers,
          JSON.stringify({
            model: opts.model,
            messages: [
              { role: "system", content: opts.system },
              { role: "user", content: opts.user },
            ],
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.3,
            ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
            stream: false,
          }),
        ),
        abortSignalPromise(controller.signal),
      ]);
    } finally {
      window.clearTimeout(timeout);
    }
    if (response.status < 200 || response.status >= 300) return null;
    const parsed = JSON.parse(response.body) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = parsed.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
  } catch {
    return null;
  }
}

/* ───────────────────────── transcript improvement ────────────────────────── */

export interface ImproveContext {
  /** Working directory of the target pane. */
  cwd?: string;
  /** Recent commands from the block store (most recent last). */
  recentCommands?: string[];
  /** Active agent in the target pane ("claude", "codex", …). */
  activeAgent?: string;
}

export type ImproveMode = "regular" | "prompt";
export type ImproveEffort = "low" | "medium" | "high";

/** REGULAR mode: transcription cleanup ONLY — output what the speaker MEANT
    to type, never a rewrite. */
const REGULAR_SYSTEM = [
  "You clean up raw voice-dictation transcripts. Output what the speaker MEANT",
  "to type — their exact words, minus dictation noise. This is cleanup, NOT a",
  "rewrite.",
  "Rules:",
  "- Remove filler (um, uh, like), false starts, self-corrections, and",
  "  repetitions. When the speaker corrects themselves, keep only the final",
  "  version. Example: 'it should be like set to, um, Wednesday I think' ->",
  "  'it should be set to Wednesday'.",
  "- Fix dictation artifacts: misheard punctuation, casing, homophone slips on",
  "  technical terms (e.g. 'get commit' -> 'git commit', 'jason' -> 'JSON').",
  "- Keep the speaker's phrasing, tone, and sentence structure. Do NOT",
  "  restructure, summarize, expand, or improve their wording.",
  "- Never add content. Never invent details. Keep file paths, identifiers,",
  "  numbers, and commands exactly as spoken.",
  "- Use the provided context (cwd, recent commands, active agent) only to fix",
  "  misheard technical terms — never to add information.",
  "- Output ONLY the cleaned text: no preamble, no quotes, no markdown fences.",
].join("\n");

/** PROMPT mode: spoken task → well-structured coding-agent prompt, with
    structure scaled to the size of the ask. */
const PROMPT_SYSTEM = [
  "You turn a spoken task description into a well-structured prompt for a",
  "coding agent.",
  "Scale the structure to the size of the task:",
  "- Trivial ask: ONE clean imperative sentence. No headers, no lists.",
  "- Medium task: a short goal statement plus the key details (a few lines,",
  "  bullets only if they genuinely help).",
  "- Big multi-part task: structured sections — goal, requirements list,",
  "  constraints, acceptance criteria. Only use sections the task actually",
  "  needs.",
  "Rules:",
  "- Preserve every concrete detail verbatim: file paths, identifiers, names,",
  "  numbers, commands, error messages.",
  "- Never invent requirements, constraints, or acceptance criteria the",
  "  speaker did not state.",
  "- Remove dictation noise (filler, false starts, repetitions) and resolve",
  "  self-corrections to the final version.",
  "- Use the provided context (cwd, recent commands, active agent) ONLY to",
  "  disambiguate references like 'that file' or 'the last command' — never as",
  "  a source of new requirements.",
  "- Output ONLY the prompt text: no preamble, no quotes, no markdown fences.",
].join("\n");

function contextBlock(context: ImproveContext): string {
  const lines: string[] = [];
  if (context.cwd) lines.push(`cwd: ${context.cwd}`);
  if (context.activeAgent) lines.push(`active agent: ${context.activeAgent}`);
  if (context.recentCommands && context.recentCommands.length > 0) {
    lines.push("recent commands:");
    for (const cmd of context.recentCommands.slice(-5)) lines.push(`  $ ${cmd}`);
  }
  return lines.length > 0 ? `Context:\n${lines.join("\n")}\n\n` : "";
}

export interface ImproveOpts {
  proxyUrl: string;
  model: string;
  authToken?: string;
  /** "regular" = transcription cleanup only; "prompt" = structured agent prompt. */
  mode: ImproveMode;
  /** Reasoning effort passed to the model; "low" also shortens the timeout. */
  effort: ImproveEffort;
}

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Adaptive output budget: scales with input length and mode instead of a
    fixed cap — cleanup stays tight, big prompt-mode tasks get headroom. */
function budgetFor(mode: ImproveMode, inputLength: number): number {
  return mode === "prompt"
    ? clamp(inputLength * 3, 400, 2000)
    : clamp(inputLength * 2, 200, 800);
}

/** Rewrite a transcript (cleanup or agent prompt, per opts.mode). HARD
    FALLBACK: returns the raw transcript untouched on any error — voice input
    must never be lost. */
export async function improve(
  transcript: string,
  context: ImproveContext,
  opts: ImproveOpts,
): Promise<{ text: string; improved: boolean }> {
  const raw = transcript.trim();
  if (!raw) return { text: "", improved: false };
  const result = await chatComplete({
    proxyUrl: opts.proxyUrl,
    model: opts.model,
    authToken: opts.authToken,
    system: opts.mode === "prompt" ? PROMPT_SYSTEM : REGULAR_SYSTEM,
    user: `${contextBlock(context)}Transcript:\n${raw}`,
    maxTokens: budgetFor(opts.mode, raw.length),
    temperature: 0.2,
    reasoningEffort: opts.effort,
    timeoutMs: opts.effort === "low" ? 15_000 : CHAT_COMPLETE_TIMEOUT_MS,
  });
  return result ? { text: result, improved: true } : { text: raw, improved: false };
}
