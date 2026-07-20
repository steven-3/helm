/* ══════════════════════════════════════════════════════════════════════════
   Dropdown — helm's tokenized select replacement (DESIGN.md v4). Every former
   native <select> binds here.

   Trigger: the §10 Editable control (matte --surface-active + --border-control,
   --control-h-md/sm, focus = the §12.1 outline ring). Glass is NOT allowed on
   the trigger: it is a persistent surface (§13.2). The popover is a transient
   menu and renders as the §10 floating plate (--glow-plate + --border-panel +
   --shadow-floating), portaled to <body> so it escapes panel overflow clips
   and sits above modals/docks (z 400: over wire-scrim 150 / popovers 180,
   under the window-resize grips 1000). Flips upward near the viewport bottom.

   ARIA: the APG listbox-button pattern. DOM focus NEVER leaves the trigger;
   the open listbox is navigated via aria-activedescendant. Keyboard: Enter /
   Space / ArrowDown / ArrowUp open; arrows + Home/End move the active option
   (wrapping, skipping disabled); type-ahead matches option labels (open: moves
   active; closed: selects, native parity); Enter/Space commits; Esc closes
   (stopPropagation so an enclosing modal stays open); Tab closes and keeps
   the natural focus move.

   Motion: menuMotion (opacity + scale .97→1, --dur-2, transform-origin follows
   placement) — the same preset every helm menu uses (§8/§12.5); reduced motion
   degrades to an opacity fade via the global MotionConfig.

   States: default / hover / focus-visible / open (aria-expanded styling IS the
   active state — press-scale is banned on high-frequency chrome) / disabled /
   empty (options [] renders a non-interactive "No options" row). A value that
   matches no option renders the placeholder, never a broken control.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "motion/react";
import { menuMotion } from "../../lib/motion";
import { Icon } from "../icons";
import "../../styles/dropdown.css";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface Placement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  up: boolean;
}

const POPOVER_GAP = 4;
const POPOVER_EDGE = 8;
const POPOVER_MAX_H = 320;
const TYPEAHEAD_RESET_MS = 700;

export function Dropdown(props: {
  value: string | null;
  options: DropdownOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}): JSX.Element {
  const {
    value,
    options,
    onChange,
    placeholder = "Select…",
    size = "md",
    disabled = false,
    className,
    ariaLabel,
  } = props;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const typeBuf = useRef("");
  const typeTimer = useRef(0);

  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  /* Next enabled option from `from` (exclusive), wrapping. -1 when all disabled. */
  const move = (from: number, dir: 1 | -1): number => {
    const n = options.length;
    if (n === 0) return -1;
    let i = from;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (!options[i].disabled) return i;
    }
    return -1;
  };
  const firstEnabled = () => move(-1, 1);
  const lastEnabled = () => move(0, -1);

  const openList = () => {
    if (disabled) return;
    const preferred =
      selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : firstEnabled();
    setActiveIndex(preferred);
    setOpen(true);
  };
  const closeList = () => setOpen(false);

  const commit = (i: number) => {
    if (i < 0 || i >= options.length || options[i].disabled) return;
    onChange(options[i].value);
    closeList();
  };

  /* Type-ahead: buffer chars for a beat, match the next enabled option whose
     label starts with the buffer (searching from the current position, wrapping). */
  const typeAhead = (char: string): number => {
    window.clearTimeout(typeTimer.current);
    typeBuf.current += char.toLowerCase();
    typeTimer.current = window.setTimeout(() => {
      typeBuf.current = "";
    }, TYPEAHEAD_RESET_MS);
    const buf = typeBuf.current;
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (activeIndex + step) % n;
      if (!options[i].disabled && options[i].label.toLowerCase().startsWith(buf)) return i;
    }
    return -1;
  };

  /* ── placement: measure the popover, flip when the space below runs out ── */
  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const contentH = popRef.current ? popRef.current.scrollHeight : POPOVER_MAX_H;
      const spaceBelow = vh - rect.bottom - POPOVER_GAP - POPOVER_EDGE;
      const spaceAbove = rect.top - POPOVER_GAP - POPOVER_EDGE;
      const up = spaceBelow < Math.min(contentH, POPOVER_MAX_H) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(POPOVER_MAX_H, up ? spaceAbove : spaceBelow));
      const height = Math.min(contentH, maxHeight);
      const top = up ? rect.top - POPOVER_GAP - height : rect.bottom + POPOVER_GAP;
      const left = Math.min(Math.max(POPOVER_EDGE, rect.left), Math.max(POPOVER_EDGE, vw - rect.width - POPOVER_EDGE));
      setPlacement((prev) =>
        prev &&
        prev.up === up &&
        prev.maxHeight === maxHeight &&
        prev.width === rect.width &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.top - top) < 0.5
          ? prev
          : { left, top, width: rect.width, maxHeight, up },
      );
    };
    update();
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true); /* panels scroll internally */
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, options.length]);

  /* ── outside pointer closes ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      closeList();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  /* ── keep the active option in view (manual: scrollIntoView would yank the
        enclosing settings panel too) ─────────────────────────────────────── */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const pop = popRef.current;
    const el = document.getElementById(optionId(activeIndex));
    if (!pop || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < pop.scrollTop) pop.scrollTop = top;
    else if (bottom > pop.scrollTop + pop.clientHeight) pop.scrollTop = bottom - pop.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const { key } = e;
    const printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

    if (!open) {
      if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp") {
        e.preventDefault(); /* suppresses the compat click for Enter/Space */
        openList();
      } else if (key === "Home") {
        const i = firstEnabled();
        if (i >= 0) { e.preventDefault(); onChange(options[i].value); }
      } else if (key === "End") {
        const i = lastEnabled();
        if (i >= 0) { e.preventDefault(); onChange(options[i].value); }
      } else if (printable) {
        const i = typeAhead(key);
        if (i >= 0) { e.preventDefault(); onChange(options[i].value); }
      }
      return;
    }

    switch (key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); /* an enclosing modal/scrim must not close with us */
        closeList();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => move(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => move(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(firstEnabled());
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(lastEnabled());
        break;
      case "Tab":
        closeList(); /* natural focus move continues */
        break;
      default:
        if (printable) {
          e.preventDefault();
          const i = typeAhead(key);
          if (i >= 0) setActiveIndex(i);
        }
    }
  };

  const rootCls = ["dd", size === "sm" ? "sm" : null, className].filter(Boolean).join(" ");

  return (
    <div className={rootCls}>
      <button
        ref={triggerRef}
        type="button"
        className="dd-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        title={selected ? selected.label : undefined}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`dd-value${selected ? "" : " placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="ic-caret" size="xs" className="dd-caret icon" />
      </button>
      <AnimatePresence>
        {open &&
          createPortal(
            <m.div
              {...menuMotion}
              ref={popRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="dd-pop"
              data-placement={placement?.up ? "top" : "bottom"}
              style={{
                left: placement?.left ?? 0,
                top: placement?.top ?? 0,
                width: placement?.width,
                maxHeight: placement?.maxHeight,
                visibility: placement ? "visible" : "hidden",
              }}
            >
              {options.length === 0 && <div className="dd-empty">No options</div>}
              {options.map((opt, i) => (
                <div
                  key={`${opt.value}-${i}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === selectedIndex}
                  aria-disabled={opt.disabled || undefined}
                  data-active={i === activeIndex || undefined}
                  className="dd-option"
                  onMouseEnter={() => {
                    if (!opt.disabled && i !== activeIndex) setActiveIndex(i);
                  }}
                  onMouseDown={(e) => e.preventDefault()} /* focus stays on the trigger */
                  onClick={() => commit(i)}
                >
                  <span className="dd-option-text">
                    <span className="dd-option-label">{opt.label}</span>
                    {opt.description && <span className="dd-option-desc">{opt.description}</span>}
                  </span>
                  {i === selectedIndex && <Icon name="ic-check" size="xs" className="dd-option-check icon" />}
                </div>
              ))}
            </m.div>,
            document.body,
          )}
      </AnimatePresence>
    </div>
  );
}
