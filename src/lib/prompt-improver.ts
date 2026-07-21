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
}

/** One-shot chat completion via proxy_http. Resolves null on ANY failure. */
export async function chatComplete(opts: ChatCompleteOpts): Promise<string | null> {
  try {
    const url = `${opts.proxyUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CHAT_COMPLETE_TIMEOUT_MS);
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

const IMPROVER_SYSTEM = [
  "You rewrite raw voice transcripts into crisp prompts for a coding agent.",
  "Rules:",
  "- Preserve the speaker's intent exactly; never add new requirements.",
  "- Fix dictation artifacts (filler words, run-ons, misheard punctuation).",
  "- Keep file paths, identifiers, and commands verbatim.",
  "- Use the provided context (cwd, recent commands, active agent) only to",
  "  disambiguate references like 'that file' or 'the last command'.",
  "- Output ONLY the rewritten prompt text: no preamble, no quotes, no markdown fences.",
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
}

/** Rewrite a transcript into an agent prompt. HARD FALLBACK: returns the raw
    transcript untouched on any error — voice input must never be lost. */
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
    system: IMPROVER_SYSTEM,
    user: `${contextBlock(context)}Transcript:\n${raw}`,
    maxTokens: 512,
    temperature: 0.2,
  });
  return result ? { text: result, improved: true } : { text: raw, improved: false };
}
