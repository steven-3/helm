/* ══════════════════════════════════════════════════════════════════════════
   ShortcutCheatsheet (v3.1) — the keyboard map, one overlay. A centered
   floating plate over --scrim (the §10 floating recipe, shared with Settings),
   entered via overlayMotion (§12.5 --dur-overlay fade + scale .98→1). Occasional
   → motion is gate-OK; reduced motion keeps the fade via the root MotionConfig.

   Content is a live mirror of the shortcut registry (getShortcutList), grouped
   by category, rows in a two-column grid: description left, keycap chips right
   (one .kbd per key segment, §12.4 --kbd-*). Opened three ways: the registered
   mod+/ shortcut (lib/shortcuts), the command palette action, the Settings row.

   a11y mirrors the Settings modal: focus the panel on open, Tab trapped,
   Escape closes, prior focus restored on unmount.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { overlayMotion, scrimMotion } from "../lib/motion";
import { useCheatsheet } from "../store/cheatsheet";
import { usePalette } from "../store/palette";
import { getShortcutList, formatKeySegments } from "../lib/shortcuts";
import { Icon } from "./icons";

function CheatsheetSheet() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const setOpen = useCheatsheet((s) => s.setOpen);
  // Snapshot at open: the registry is static after boot, so no live subscription.
  const groups = getShortcutList();
  const close = () => setOpen(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (usePalette.getState().open) return; // the palette above owns Escape
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((control) => control.offsetParent !== null && control.getAttribute("aria-hidden") !== "true");
      if (controls.length === 0) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <m.div className="sc-scrim" onMouseDown={close} {...scrimMotion}>
      <m.div
        className="sc-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-title"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        {...overlayMotion}
      >
        <header className="sc-head">
          <h2 id="sc-title">Keyboard shortcuts</h2>
          <button type="button" className="modal-close" aria-label="Close shortcuts" onClick={close}>
            <Icon name="ic-close" size="sm" />
          </button>
        </header>

        <div className="sc-body">
          {groups.map((group) => (
            <section className="sc-cat" key={group.category}>
              <h3 className="sc-cat-title">{group.category}</h3>
              <div className="sc-grid">
                {group.items.map((item) => (
                  <div className="sc-row" key={item.id}>
                    <span className="sc-desc">{item.description}</span>
                    <span className="sc-keys">
                      {formatKeySegments(item.keys).map((segment, index) => (
                        <kbd className="kbd" key={index}>{segment}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </m.div>
    </m.div>
  );
}

/** Store-driven mount (useCheatsheet); AnimatePresence runs the exit fade. */
export function ShortcutCheatsheet() {
  const open = useCheatsheet((s) => s.open);
  return <AnimatePresence>{open && <CheatsheetSheet />}</AnimatePresence>;
}
