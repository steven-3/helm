/* ══════════════════════════════════════════════════════════════════════════
   ScrollPill — floating bottom-right "N new lines ↓" pill shown while the
   viewport is scrolled up and output accrues below (§4.13 parity). One click
   jumps to the bottom. Floating role (§7): overlay plate + panel hairline +
   floating shadow + pill radius. The count rides the §12.4 badge tokens — the
   one sanctioned solid-indigo element besides a primary button. Renders
   NOTHING when count is 0 (its empty state is absence, not a disabled pill).

   Motion: menuMotion (fade + scale .97→1, --dur-2) — arrival is occasional;
   exit needs an <AnimatePresence> in the parent, else it simply unmounts
   (acceptable: disappearance after jumping is expected, not a lost cue).
   ══════════════════════════════════════════════════════════════════════════ */
import { m } from "motion/react";
import { menuMotion } from "../lib/motion";
import { Icon } from "./icons";

export interface ScrollPillProps {
  count: number;
  onJump: () => void;
}

export function ScrollPill({ count, onJump }: ScrollPillProps) {
  if (count <= 0) return null;

  const lines = count === 1 ? "1 new line" : `${count} new lines`;

  return (
    <m.button
      type="button"
      className="scroll-pill"
      aria-label={`${lines}, jump to bottom`}
      onClick={onJump}
      {...menuMotion}
    >
      <Icon name="ic-caret" size="xs" />
      <span className="scroll-pill-count" aria-hidden="true">
        {count > 999 ? "999+" : count}
      </span>
      <span className="scroll-pill-label">{count === 1 ? "new line" : "new lines"}</span>
    </m.button>
  );
}
