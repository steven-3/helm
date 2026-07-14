/* ══════════════════════════════════════════════════════════════════════════
   TopSplitter (WS-2) — a draggable seam for a top-level chrome plate (sidebar or
   Stage). It mirrors the in-tab SplitPanes divider conventions so the two feel
   identical: pointer + keyboard (Arrow / Home / End), rAF-batched live updates, a
   min/max clamp, and a collapse-below-threshold that composes with the layout's
   show/hide booleans. The one structural difference: an in-tab divider splits a
   pair of flex RATIOS, whereas a top plate is an absolute PIXEL width and the
   flex:1 center absorbs the remainder — so dragging the Stage seam larger shrinks
   the terminal center (the WS-2 target interaction).

   Geometry: the splitter STRADDLES the existing zone seam as a net-zero-width
   overlay (width:10px + -5px side margins, see components.css). Inserting it
   never shifts layout nor opens a void channel between a chrome plate and the
   terminal well; its 1px ::after hairline lands EXACTLY on the neighbour's
   border-zone seam (§3 groove) — coincident, so there is no double hairline.

   Perf: a drag flips the shared useResizing.windowResizing flag (WS-3's gate) so
   xterm SUSPENDS reflow for the whole gesture and refits ONCE on settle — reusing
   the terminal gate WITHOUT the <body data-window-resizing> gradient swap (that
   stays a genuine window-resize affordance). Direct manipulation → no transition
   on the tracked width and no animation on the splitter (§8 frequency gate).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { useResizing } from "../store/resizing";

/** The terminal hero never drags below this — the dynamic max for either plate. */
const CENTER_MIN = 400;

interface TopSplitterProps {
  /** which plate this seam resizes — drives the grow direction + the CSS var. */
  side: "sidebar" | "stage";
  /** current committed width (px); stable across a drag (no re-render mid-drag). */
  width: number;
  min: number;
  max: number;
  /** raw (unclamped) target below this (px) → collapse the plate on release. */
  collapseAt: number;
  /** the --sidebar-width / --stage-width custom prop on .app to drive live. */
  cssVar: "--sidebar-width" | "--stage-width";
  label: string;
  /** commit a settled width to the layout store (clamped there too). */
  onCommit: (px: number) => void;
  /** dragged past the collapse threshold → hide the plate (width is kept). */
  onCollapse: () => void;
}

interface Drag {
  el: HTMLElement;        // the splitter itself (for the arm-collapse cue)
  appEl: HTMLElement;     // the .app root that carries the live width var
  startCoord: number;
  startWidth: number;
  effectiveMax: number;   // measured once at grab: plate width when center hits CENTER_MIN
  pendingCoord: number;
  frame: number | null;
  latest: number;
  wantsCollapse: boolean;
}

export function TopSplitter({
  side, width, min, max, collapseAt, cssVar, label, onCommit, onCollapse,
}: TopSplitterProps) {
  const dragRef = useRef<Drag | null>(null);
  const setWindowResizing = useResizing((s) => s.setWindowResizing);

  useEffect(() => () => {
    if (dragRef.current) {
      setWindowResizing(false);
      delete document.documentElement.dataset.topResizing;
    }
  }, []);

  // How wide this plate may grow before the flex:1 center hits CENTER_MIN —
  // measured live from the current center, so the rail + both plates are already
  // accounted for (the center is exactly what shrinks as either plate grows).
  const measureEffectiveMax = (fromWidth: number): number => {
    const center = document.querySelector<HTMLElement>(".center");
    const room = center ? center.getBoundingClientRect().width - CENTER_MIN : Infinity;
    return Math.max(min, Math.min(max, fromWidth + Math.max(0, room)));
  };

  const apply = (drag: Drag, coord: number) => {
    const dx = coord - drag.startCoord;
    // sidebar grows as the seam moves RIGHT (+dx); stage grows as it moves LEFT.
    const raw = side === "sidebar" ? drag.startWidth + dx : drag.startWidth - dx;
    drag.wantsCollapse = raw < collapseAt;
    drag.latest = Math.min(drag.effectiveMax, Math.max(min, raw));
    drag.appEl.style.setProperty(cssVar, `${drag.latest}px`);
    drag.el.classList.toggle("arm-collapse", drag.wantsCollapse); // swell → release to collapse
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const appEl = event.currentTarget.closest<HTMLElement>(".app");
    if (!appEl) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
    document.documentElement.dataset.topResizing = "column";
    setWindowResizing(true); // suspend xterm reflow for the gesture (WS-3 gate)
    dragRef.current = {
      el: event.currentTarget,
      appEl,
      startCoord: event.clientX,
      startWidth: width,
      effectiveMax: measureEffectiveMax(width),
      pendingCoord: event.clientX,
      frame: null,
      latest: width,
      wantsCollapse: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pendingCoord = event.clientX;
    if (drag.frame != null) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = null;
      apply(drag, drag.pendingCoord);
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.frame != null) {
      cancelAnimationFrame(drag.frame);
      apply(drag, drag.pendingCoord);
    }
    const el = event.currentTarget;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    el.classList.remove("dragging", "arm-collapse");
    delete document.documentElement.dataset.topResizing;
    if (drag.wantsCollapse) onCollapse();      // keep the width, just hide the plate
    else onCommit(drag.latest);
    setWindowResizing(false);                  // → TerminalPane's subscribe refits once
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const effectiveMax = measureEffectiveMax(width);
    const step = event.shiftKey ? 48 : 16;
    // Arrow moves the SEAM; translate that to a width delta for this side.
    const seam = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const dir = side === "sidebar" ? seam : -seam;
    const next = event.key === "Home"
      ? min
      : event.key === "End"
        ? effectiveMax
        : Math.min(effectiveMax, Math.max(min, width + dir * step));
    if (next !== width) onCommit(next);
  };

  return (
    <div
      className={`top-splitter for-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      aria-valuetext={`${label}: ${Math.round(width)} pixels`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}
