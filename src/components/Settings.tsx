/* ══════════════════════════════════════════════════════════════════════════
   Settings (modal, e4) — opened from the rail. Minimal + on-system: theme
   (dark-first; light is a v1-disabled re-map per §9), the opt-in near-invisible
   titlebar accent glow (§3 backlog flourish, off by default), and a background
   note (matte-only by construction). Reading copy uses --font-sans ≥16px (§6);
   labels stay mono. Scrim + Escape close; focus moves into the dialog on open.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { Icon } from "./icons";

export function Settings({
  onClose,
  glow,
  onGlowChange,
}: {
  onClose: () => void;
  glow: boolean;
  onGlowChange: (v: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title" id="settings-title">
            <Icon name="ic-settings" className="icon sm" />settings
          </span>
          <button className="modal-close" aria-label="Close settings" onClick={onClose}>
            <Icon name="ic-close" className="icon sm" />
          </button>
        </div>

        <div className="modal-body">
          <div className="set-row">
            <span className="set-label">Theme</span>
            <p className="set-desc">
              helm ships dark-first — a matte flat-dark command center tuned for long, low-fatigue
              sessions. A light theme is a semantic re-map of the same tokens (roadmap).
            </p>
            <div className="seg" role="group" aria-label="Theme">
              <button className="on" aria-pressed="true">Dark</button>
              <button disabled title="v1 ships dark only">Light</button>
            </div>
          </div>

          <div className="set-row">
            <div className="set-inline">
              <div>
                <span className="set-label">Titlebar accent glow</span>
                <p className="set-desc">
                  A near-invisible azure edge on the titlebar. Off by default — the terminal stays the hero.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={glow}
                aria-label="Titlebar accent glow"
                className="switch"
                onClick={() => onGlowChange(!glow)}
              >
                <span className="knob" />
              </button>
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">Background</span>
            <p className="set-desc">
              Solid matte surfaces everywhere — glass and blur are forbidden on content by construction
              (the density gate). Depth comes from tonal elevation + hairlines.
            </p>
            <span className="set-tag">solid · matte</span>
          </div>
        </div>
      </div>
    </div>
  );
}
