import type { OscCommand, OscCopy, OscImg, OscLink } from "./contract";
import { fsExists } from "./commands";
import { usePanes } from "../store/panes";
import { useStage } from "../store/stage";

const MAX_LINE_LENGTH = 2_048;
const WINDOW_SIZE = 5;
const DEDUPE_TTL_MS = 15_000;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 8;
const MAX_IN_FLIGHT_IMAGE_STATS = 6;

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]{4,}/g;
const URL_TRAILING_RE = /[.,;:!?)\]}'"]+$/;
const URL_ONLY_RE = /^https?:\/\//i;
const COPY_CUE_RE = /\b(copy(?:\s+this)?|paste this|here'?s your|your\s+\w+\s+(?:is|token|key|code|secret))\b\s*[:=]?/i;
const HEX_TOKEN_RE = /^[0-9a-f]{32,}$/i;
const UUID_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_TOKEN_RE = /^[A-Za-z0-9+/_-]{24,}={0,2}$/;
const KNOWN_KEY_RE = /^(sk-|pk-|ghp_|gho_|github_pat_|xox[baprs]-|AKIA|AIza|Bearer\s)[A-Za-z0-9_-]{16,}/;
const BACKTICK_VALUE_RE = /^`([^`\s]{8,})`$/;
const PROMPT_COMMAND_RE = /^\s*[$>]\s+(\S.*)$/;
const SHELL_FENCE_RE = /^\s*```(?:bash|sh|shell|zsh|console)\s*$/i;
const COMMAND_TOKEN_RE = /^[A-Za-z0-9._\/-]+$/;
const COMMAND_CAUTION_RE = /\brm\s+-rf|\bsudo\b|\bmkfs|\bdd\s|:\(\)\{|>\s*\/dev\/sd|chmod\s+-R\s+777/;
const IMAGE_PATH_RE = /(?:^|[\s("'`\[{])([^\s<>"'`()\[\]{}]+?\.(?:png|jpe?g|gif|webp|bmp|svg|ico|tiff?))(?=$|[\s)"'`,;:!?\]}])/gi;
const ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|[\\/]|~(?:[\\/]|$))/;

type DetectedPayload = OscCopy | OscLink | OscImg | OscCommand;

interface DetectorState {
  window: string[];
  dedupe: Map<string, number>;
  emittedAt: number[];
  imageStatsInFlight: Set<string>;
}

const detectorStates = new Map<string, DetectorState>();

function stateFor(paneId: string): DetectorState {
  let state = detectorStates.get(paneId);
  if (!state) {
    state = { window: [], dedupe: new Map(), emittedAt: [], imageStatsInFlight: new Set() };
    detectorStates.set(paneId, state);
  }
  return state;
}

function normalizeValue(value: string): string {
  return value.trim();
}

function passesPushGuards(state: DetectorState, key: string, now: number): boolean {
  for (const [dedupeKey, expiry] of state.dedupe) {
    if (expiry <= now) state.dedupe.delete(dedupeKey);
  }
  if ((state.dedupe.get(key) ?? 0) > now) return false;

  state.emittedAt = state.emittedAt.filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
  return state.emittedAt.length < RATE_LIMIT;
}

function pushDetected(
  paneId: string,
  state: DetectorState,
  payload: DetectedPayload,
  value: string,
): void {
  if (detectorStates.get(paneId) !== state) return;

  const now = Date.now();
  const key = `${payload.t}:${normalizeValue(value)}`;
  if (!passesPushGuards(state, key, now)) return;

  state.dedupe.set(key, now + DEDUPE_TTL_MS);
  state.emittedAt.push(now);
  const agent = usePanes.getState().panes[paneId]?.agent ?? "shell";
  useStage.getState().push({ paneId, agent, payload, reveal: false });
}

function shannonEntropy(value: string): number {
  const characters = Array.from(value);
  if (characters.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const character of characters) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / characters.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function hasTwoCharacterClasses(value: string): boolean {
  return Number(/[a-z]/.test(value)) + Number(/[A-Z]/.test(value)) + Number(/\d/.test(value)) >= 2;
}

function isWholeKnownKey(value: string): boolean {
  const match = value.match(KNOWN_KEY_RE);
  return match?.[0] === value;
}

function isHighEntropyToken(value: string): boolean {
  const knownKey = isWholeKnownKey(value);
  if (!knownKey) {
    if (value.length < 24 || /\s/.test(value)) return false;
    if (!HEX_TOKEN_RE.test(value) && !UUID_TOKEN_RE.test(value) && !BASE64_TOKEN_RE.test(value)) {
      return false;
    }
  }
  return shannonEntropy(value) >= 3.5 && hasTwoCharacterClasses(value);
}

function cueValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const wrapped = value.match(BACKTICK_VALUE_RE);
  if (wrapped) return wrapped[1];
  if (isWholeKnownKey(value)) return value;
  return /[\s`]/.test(value) ? null : value;
}

function valueAfterCue(line: string): string | null {
  let offset = 0;
  while (offset < line.length) {
    const match = COPY_CUE_RE.exec(line.slice(offset));
    if (!match) return null;
    const start = offset + (match.index ?? 0);
    const end = start + match[0].length;
    const value = cueValue(line.slice(end));
    if (value) return value;
    offset = start + 1;
  }
  return null;
}

function isCueOnly(line: string): boolean {
  let offset = 0;
  while (offset < line.length) {
    const match = COPY_CUE_RE.exec(line.slice(offset));
    if (!match) return false;
    const start = offset + (match.index ?? 0);
    const end = start + match[0].length;
    if (!line.slice(end).trim()) return true;
    offset = start + 1;
  }
  return false;
}

function copyValueForLine(line: string, previousLine: string): string | null {
  const inline = valueAfterCue(line);
  if (inline) return inline;

  const trimmed = line.trim();
  if (isCueOnly(previousLine)) {
    const following = cueValue(trimmed);
    if (following) return following;
  }

  const wrapped = trimmed.match(BACKTICK_VALUE_RE);
  if (wrapped) return wrapped[1];
  return isHighEntropyToken(trimmed) ? trimmed : null;
}

function commandForLine(line: string, previousLine: string): string | null {
  const prompt = line.match(PROMPT_COMMAND_RE);
  const command = prompt?.[1] ?? (SHELL_FENCE_RE.test(previousLine) ? line.trim() : null);
  if (!command || command.length > 512 || /[\r\n]/.test(command) || URL_ONLY_RE.test(command)) return null;
  if (command.includes("=>") || /\{\s*$/.test(command) || /;\s*$/.test(command)) return null;

  const firstToken = command.split(/\s+/, 1)[0];
  return COMMAND_TOKEN_RE.test(firstToken) ? command : null;
}

function detectLinks(paneId: string, state: DetectorState, line: string): void {
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(line)) !== null) {
    const url = match[0].replace(URL_TRAILING_RE, "");
    if (url) pushDetected(paneId, state, { v: 1, t: "link", url }, url);
  }
}

function resolveImagePath(path: string, cwd?: string): string {
  if (ABSOLUTE_PATH_RE.test(path) || !cwd) return path;
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${separator}${path}`;
}

function imagePathsForLine(line: string, cwd?: string): string[] {
  IMAGE_PATH_RE.lastIndex = 0;
  const paths = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = IMAGE_PATH_RE.exec(line)) !== null) {
    const candidate = match[1];
    if (!URL_ONLY_RE.test(candidate)) paths.add(resolveImagePath(candidate, cwd));
  }
  return [...paths];
}

async function detectImages(paneId: string, state: DetectorState, line: string): Promise<void> {
  const cwd = usePanes.getState().panes[paneId]?.cwd;
  for (const path of imagePathsForLine(line, cwd)) {
    if (detectorStates.get(paneId) !== state) return;

    const key = `img:${normalizeValue(path)}`;
    if (!passesPushGuards(state, key, Date.now())) continue;
    if (
      state.imageStatsInFlight.has(key) ||
      state.imageStatsInFlight.size >= MAX_IN_FLIGHT_IMAGE_STATS
    ) continue;

    state.imageStatsInFlight.add(key);
    let exists = false;
    try {
      exists = await fsExists(path).catch(() => false);
    } finally {
      state.imageStatsInFlight.delete(key);
    }

    if (detectorStates.get(paneId) !== state) return;
    if (exists) pushDetected(paneId, state, { v: 1, t: "img", path }, path);
  }
}

export function onDetectorLine(paneId: string, text: string): void {
  if (text.length > MAX_LINE_LENGTH) return;

  const state = stateFor(paneId);
  const previousLine = state.window[state.window.length - 1] ?? "";
  state.window.push(text);
  if (state.window.length > WINDOW_SIZE) state.window.splice(0, state.window.length - WINDOW_SIZE);

  detectLinks(paneId, state, text);

  const copyValue = copyValueForLine(text, previousLine);
  if (copyValue) pushDetected(paneId, state, { v: 1, t: "copy", text: copyValue }, copyValue);

  // Detector commands are inert data only: this module never writes to a PTY or
  // runs anything. The later UI must require a click and use this exact string.
  const command = commandForLine(text, previousLine);
  if (command) {
    const payload: OscCommand = { v: 1, t: "command", command };
    if (COMMAND_CAUTION_RE.test(command)) payload.caution = true;
    pushDetected(paneId, state, payload, command);
  }

  void detectImages(paneId, state, text);
}

export function disposeDetector(paneId: string): void {
  detectorStates.delete(paneId);
}
