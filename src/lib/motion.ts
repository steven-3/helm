/* ══════════════════════════════════════════════════════════════════════════
   Motion presets (DESIGN.md §8) — the OCCASIONAL / RARE motions only, driven by
   the Motion library (motion.dev). Durations + eases MIRROR tokens.css §8
   (--dur-*, --ease-out) so nothing drifts from the design system.

   Frequency gate (§8) — what is NOT here, by construction: tab switch, pane
   focus/mount, rail view changes, sidebar show/hide, roster rows, palette,
   keyboard actions. Those stay INSTANT. The FilesView tree-expand + the
   running-agent pulse stay in CSS (they are the sanctioned CSS motions).

   Reduced motion is handled ONCE, globally, by <MotionConfig reducedMotion=
   "user"> at the App root: Motion drops transform/scale but KEEPS opacity — so
   every preset below automatically degrades to an opacity-only fade under
   prefers-reduced-motion. No per-preset branch needed (§8: "reduce ≠ zero").

   Character: instrument restraint — decelerating ease-out, no overshoot, no bounce;
   only transform + opacity ever animate (never `all`, never layout props).
   ══════════════════════════════════════════════════════════════════════════ */
import type { Transition } from "motion/react";

/** --ease-out = cubic-bezier(0.23, 1, 0.32, 1) — enter/exit deceleration. */
export const easeOut: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** --dur-* tokens, expressed in seconds for Motion. */
export const dur = { fast: 0.12, d2: 0.18, d3: 0.22, d4: 0.28 } as const;

/**
 * Stage widget/card arrival (§8 "Stage widget arrival": opacity 0→1 + scale
 * .97→1). The one signature occasional motion. Exit is a touch subtler (.98)
 * and drives card removal + pane-switch swaps via <AnimatePresence>.
 */
export const cardMotion = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: dur.d2, ease: easeOut } satisfies Transition,
};

/** Switcher dropdown (e3 popover) — quick; transform-origin top-left is in CSS.
 *  --dur-2 (180ms): token-driven, within the 150–250ms dropdown budget, and the
 *  original pop-in duration this replaces. */
export const menuMotion = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: dur.d2, ease: easeOut } satisfies Transition,
};

/** Settings scrim — opacity only (it is a scrim, never a moving element). */
export const scrimMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: dur.d3, ease: easeOut } satisfies Transition,
};

/** Settings modal — opacity + scale from center (§8: modals stay center). */
export const modalMotion = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: dur.d4, ease: easeOut } satisfies Transition,
};

/** Top-level non-terminal workspace reveal. The terminal deck itself never
 * animates or unmounts; only lightweight chrome pages use this transition. */
export const pageMotion = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 2 },
  transition: { duration: dur.d2, ease: easeOut } satisfies Transition,
};

/**
 * Stage dock reveal/collapse — x-slide + opacity (NEVER width: §8 animates only
 * transform/opacity). The 10px slide is clipped by the shell's overflow:hidden,
 * so it can never introduce a horizontal scrollbar. Paired with the reveal strip
 * inside a single <AnimatePresence mode="wait"> so the two states never overlap.
 */
export const dockMotion = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
  transition: { duration: dur.d2, ease: easeOut } satisfies Transition,
};

/** Collapsed reveal strip — opacity only (tiny element, no slide). */
export const revealMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: dur.fast, ease: easeOut } satisfies Transition,
};

/**
 * Press feedback for OCCASIONAL action targets ONLY (copy-field, switcher items;
 * a primary button if/when one ships). NEVER on high-frequency chrome (rail,
 * tabs, pane-tools, roster). A transform, so it is dropped under reduced motion.
 */
export const pressTap = { scale: 0.97 };
