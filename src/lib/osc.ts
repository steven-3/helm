/* ══════════════════════════════════════════════════════════════════════════
   OSC 5379 payload parser (Phase-3 integration, owned by the integrator).
   The xterm OSC handler hands us the string between  ESC ]5379;  and  BEL  —
   i.e. the raw JSON. xterm's parser buffers partial OSC across chunked PTY
   reads, so `data` here is always a complete sequence. We validate defensively
   (a program could emit malformed JSON) and drop anything that isn't a v1
   OscPayload rather than throwing into the render loop.
   ══════════════════════════════════════════════════════════════════════════ */
import type { OscPayload, StageWidgetType } from "./contract";

const TYPES: ReadonlySet<StageWidgetType> = new Set([
  "copy",
  "link",
  "img",
  "widget",
  "confirm",
  "choice",
  "ask",
  "table",
  "json",
  "md",
  "diff",
  "progress",
]);
const SAFE_LINK_SCHEME_RE = /^(https?|mailto|tel):/i;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const UNSAFE_MULTILINE_RE = /[\x00\x1b]/;

const isBoundedString = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.length <= maxLength && !CONTROL_CHAR_RE.test(value);
const isNonEmptyString = (value: unknown, maxLength: number): value is string =>
  isBoundedString(value, maxLength) && value.trim().length > 0;
const isOptionalString = (value: unknown, maxLength?: number): value is string | undefined =>
  value === undefined || (typeof value === "string" && (maxLength === undefined || value.length <= maxLength));
const isOptionalBoundedString = (value: unknown, maxLength: number): value is string | undefined =>
  value === undefined || isBoundedString(value, maxLength);
const isSafeMultilineString = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.length <= maxLength && !UNSAFE_MULTILINE_RE.test(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const hasValidId = (value: Record<string, unknown>) => isOptionalString(value.id);
const isChoiceOption = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const option = value as Record<string, unknown>;
  return isBoundedString(option.label, 200) && isBoundedString(option.send, 512);
};
const isValidTable = (o: Record<string, unknown>) => {
  const columns = o.columns;
  const rows = o.rows;
  if (!Array.isArray(columns)
      || columns.length === 0
      || columns.length > 16
      || !columns.every((column) => isNonEmptyString(column, 120))
      || !Array.isArray(rows)
      || rows.length > 200) {
    return false;
  }
  return rows.every((row) => Array.isArray(row)
    && row.length === columns.length
    && row.every((cell) => isBoundedString(cell, 500)));
};
const isParseableJson = (value: unknown) => {
  if (typeof value !== "string" || value.length > 32768) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const isValidPayload = (o: Record<string, unknown>) => {
  if (!isOptionalBoundedString(o.label, 200)) return false;
  switch (o.t) {
    case "confirm":
      return isNonEmptyString(o.prompt, 2000)
        && isOptionalBoundedString(o.yes, 512)
        && isOptionalBoundedString(o.no, 512)
        && hasValidId(o);
    case "choice":
      return isNonEmptyString(o.prompt, 2000)
        && Array.isArray(o.options)
        && o.options.length > 0
        && o.options.every(isChoiceOption)
        && hasValidId(o);
    case "ask":
      return isNonEmptyString(o.prompt, 2000)
        && isOptionalBoundedString(o.placeholder, 200)
        && hasValidId(o);
    case "table":
      return isValidTable(o);
    case "json":
      return isParseableJson(o.json);
    case "md":
      return isSafeMultilineString(o.md, 32768);
    case "diff":
      return isSafeMultilineString(o.diff, 32768);
    case "progress":
      return isFiniteNumber(o.value)
        && o.value >= 0
        && (o.max === undefined || (isFiniteNumber(o.max) && o.max > 0))
        && hasValidId(o);
    default:
      return true;
  }
};

export function parseOsc(data: string): OscPayload | null {
  try {
    const o = JSON.parse(data) as Record<string, unknown>;
    if (o && o.v === 1 && typeof o.t === "string" && TYPES.has(o.t as StageWidgetType)) {
      if (o.t === "link" && (typeof o.url !== "string" || !SAFE_LINK_SCHEME_RE.test(o.url))) {
        return null;
      }
      if (!isValidPayload(o)) return null;
      return o as unknown as OscPayload;
    }
  } catch {
    /* partial or malformed sequence — ignore, never crash the terminal */
  }
  return null;
}
