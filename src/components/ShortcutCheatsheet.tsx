/* ══════════════════════════════════════════════════════════════════════════
   ShortcutCheatsheet - live shortcut editor. Generic keybinds persist through
   lib/shortcuts; voice toggle/hold bindings remain owned by useVoice.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { overlayMotion, scrimMotion } from "../lib/motion";
import { useCheatsheet } from "../store/cheatsheet";
import { usePalette } from "../store/palette";
import { useVoice } from "../store/voice";
import { getShortcutList, setShortcutOverride } from "../lib/shortcuts";
import { Icon } from "./icons";
import { ShortcutRecorder } from "./ShortcutRecorder";
import "./ShortcutEditor.css";

function CheatsheetSheet() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const setOpen = useCheatsheet((state) => state.setOpen);
  useCheatsheet((state) => state.revision);
  const recordingId = useCheatsheet((state) => state.recordingId);
  const toggleShortcut = useVoice((state) => state.toggleShortcut);
  const holdShortcut = useVoice((state) => state.holdShortcut);
  const setToggleShortcut = useVoice((state) => state.setToggleShortcut);
  const setHoldShortcut = useVoice((state) => state.setHoldShortcut);

  const groups = getShortcutList()
    .map((group) => ({ ...group, items: group.items.filter((item) => item.id !== "voice.toggle") }))
    .filter((group) => group.items.length > 0);
  const close = () => setOpen(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (recordingId || usePalette.getState().open) return;
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
  }, [recordingId]);

  return (
    <m.div className="sc-scrim" onMouseDown={close} {...scrimMotion}>
      <m.div
        className="sc-panel sc-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-title"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        {...overlayMotion}
      >
        <header className="sc-head">
          <div>
            <h2 id="sc-title">Keyboard shortcuts</h2>
            <p className="sc-intro">Select a key field, then press the replacement combination.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close shortcuts" onClick={close}>
            <Icon name="ic-close" size="sm" />
          </button>
        </header>

        <div className="sc-body">
          <section className="sc-cat" aria-labelledby="sc-voice-title">
            <h3 className="sc-cat-title" id="sc-voice-title">Voice</h3>
            <div className="sc-grid sc-grid-single">
              <div className="sc-row sc-edit-row">
                <span className="sc-desc-wrap">
                  <span className="sc-desc">Toggle voice recording</span>
                  <span className="sc-row-note">Press once to start, then press again to send.</span>
                </span>
                <ShortcutRecorder id="voice.toggle" value={toggleShortcut} onChange={setToggleShortcut} ariaLabel="Record voice toggle shortcut" />
              </div>
              <div className="sc-row sc-edit-row">
                <span className="sc-desc-wrap">
                  <span className="sc-desc">Hold to talk</span>
                  <span className="sc-row-note">Hold to record and release to send. Double-tap the hold key to lock recording on.</span>
                </span>
                <ShortcutRecorder id="voice.hold" value={holdShortcut} onChange={setHoldShortcut} ariaLabel="Record hold to talk shortcut" />
              </div>
            </div>
          </section>

          {groups.map((group) => (
            <section className="sc-cat" key={group.category}>
              <h3 className="sc-cat-title">{group.category}</h3>
              <div className="sc-grid">
                {group.items.map((item) => (
                  <div className="sc-row sc-edit-row" key={item.id}>
                    <span className="sc-desc">{item.description}</span>
                    <ShortcutRecorder
                      compact
                      id={item.id}
                      value={item.keys}
                      onChange={(accelerator) => setShortcutOverride(item.id, accelerator)}
                      ariaLabel={`Record shortcut for ${item.description}`}
                    />
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

export function ShortcutCheatsheet() {
  const open = useCheatsheet((state) => state.open);
  return <AnimatePresence>{open && <CheatsheetSheet />}</AnimatePresence>;
}
