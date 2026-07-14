/* ══════════════════════════════════════════════════════════════════════════
   ImageLightbox (WS-6) — full-window overlay for a Stage image. Store-driven
   (useLightbox): ImagePreview raises it via open(url, filename); App mounts one
   instance under an <AnimatePresence>, a sibling of the Settings modal. Mirrors
   the Settings-modal overlay pattern (§8): a scrim (scrimMotion — opacity only,
   it is a scrim not a moving element) + a centered image (modalMotion — opacity +
   scale .98→1 from centre). Dismiss on Esc (window keydown) or scrim mousedown;
   the image stops propagation so a click ON it never closes. Reduced motion drops
   the scale but keeps the fade — handled globally by <MotionConfig> at the root.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { useLightbox } from "../store/lightbox";
import { scrimMotion, modalMotion } from "../lib/motion";
import { Icon } from "./icons";

export function ImageLightbox() {
  const url = useLightbox((s) => s.url);
  const alt = useLightbox((s) => s.alt);
  const close = useLightbox((s) => s.close);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog so xterm cannot consume Escape. With the close
  // button as the sole focusable element, Tab and Shift+Tab loop back to it.
  useEffect(() => {
    if (!url) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        e.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [close, url]);

  if (!url) return null;

  return (
    <m.div
      className="lightbox-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Image preview · ${alt}` : "Image preview"}
      onMouseDown={close}
      {...scrimMotion}
    >
      {/* stopPropagation: a mousedown/click landing ON the image must not bubble
          to the scrim's dismiss handler. */}
      <m.img
        className="lightbox-img"
        src={url}
        alt={alt ?? "image"}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        {...modalMotion}
      />
      <button
        ref={closeButtonRef}
        type="button"
        className="lightbox-close"
        aria-label="Close image preview"
        onClick={close}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Icon name="ic-close" size="sm" />
      </button>
    </m.div>
  );
}
