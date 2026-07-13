/* ══════════════════════════════════════════════════════════════════════════
   OSC 5379 payload parser (Phase-3 integration, owned by the integrator).
   The xterm OSC handler hands us the string between  ESC ]5379;  and  BEL  —
   i.e. the raw JSON. xterm's parser buffers partial OSC across chunked PTY
   reads, so `data` here is always a complete sequence. We validate defensively
   (a program could emit malformed JSON) and drop anything that isn't a v1
   OscPayload rather than throwing into the render loop.
   ══════════════════════════════════════════════════════════════════════════ */
import type { OscPayload, StageWidgetType } from "./contract";

const TYPES: ReadonlySet<StageWidgetType> = new Set(["copy", "link", "img", "widget"]);

export function parseOsc(data: string): OscPayload | null {
  try {
    const o = JSON.parse(data) as Record<string, unknown>;
    if (o && o.v === 1 && typeof o.t === "string" && TYPES.has(o.t as StageWidgetType)) {
      return o as unknown as OscPayload;
    }
  } catch {
    /* partial or malformed sequence — ignore, never crash the terminal */
  }
  return null;
}
