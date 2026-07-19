/* ══════════════════════════════════════════════════════════════════════════
   Icon system — the mockup's inline SVG sprite (<symbol> defs) ported verbatim,
   rendered once at app root, plus a tiny <Icon> helper that emits
   <svg class="icon…"><use href="#ic-…"/></svg>. currentColor-driven; NO npm icon
   dep (DESIGN.md / task rule). Sizing via the .icon / .icon.sm / .icon.xs classes.
   ══════════════════════════════════════════════════════════════════════════ */
import type { CSSProperties } from "react";

export type IconName =
  | "ic-helm" | "ic-files" | "ic-roster" | "ic-search" | "ic-branch" | "ic-settings"
  | "ic-min" | "ic-max" | "ic-close" | "ic-claude" | "ic-codex" | "ic-shell"
  | "ic-copy" | "ic-external" | "ic-caret" | "ic-plus" | "ic-split" | "ic-image"
  | "ic-chev" | "ic-alert" | "ic-check" | "ic-folder" | "ic-folder-open"
  | "ic-home" | "ic-pencil" | "ic-play"
  | "ic-table" | "ic-braces" | "ic-markdown" | "ic-diff" | "ic-progress" | "ic-pin"
  | "ic-bell" | "ic-broadcast" | "ic-keyboard" | "ic-info";

export function Icon({
  name,
  size,
  className = "icon",
  style,
}: {
  name: IconName;
  /** "sm" (14px) / "xs" (12px); omit for base 18px. */
  size?: "sm" | "xs";
  className?: string;
  style?: CSSProperties;
}) {
  const cls = size ? `${className} ${size}` : className;
  return (
    <svg className={cls} style={style} aria-hidden="true" focusable="false">
      <use href={`#${name}`} />
    </svg>
  );
}

/** The sprite <defs>. Rendered once (App root); not visible itself. */
export function IconSprite() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {/* brand: ship's-helm wheel */}
        <symbol id="ic-helm" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 2.5v3.3M12 18.2v3.3M2.5 12h3.3M18.2 12h3.3M5.2 5.2l2.3 2.3M16.5 16.5l2.3 2.3M18.8 5.2l-2.3 2.3M7.5 16.5l-2.3 2.3" />
        </symbol>
        {/* rail */}
        <symbol id="ic-files" viewBox="0 0 24 24">
          <path d="M3 8a2 2 0 0 1 2-2h3.4l1.8 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </symbol>
        <symbol id="ic-roster" viewBox="0 0 24 24">
          <circle cx="5" cy="7" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none" />
          <path d="M9 7h11M9 12h11M9 17h8" />
        </symbol>
        <symbol id="ic-search" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M20 20l-4.7-4.7" />
        </symbol>
        <symbol id="ic-branch" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="6" cy="18" r="2.4" />
          <circle cx="18" cy="8" r="2.4" />
          <path d="M6 8.4v7.2M18 10.5c0 3.6-3 4.2-6 4.6" />
        </symbol>
        <symbol id="ic-settings" viewBox="0 0 24 24">
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="2.1" />
          <circle cx="15" cy="12" r="2.1" />
          <circle cx="8" cy="17" r="2.1" />
        </symbol>
        {/* window */}
        <symbol id="ic-min" viewBox="0 0 24 24"><path d="M5 12h14" /></symbol>
        <symbol id="ic-max" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" /></symbol>
        <symbol id="ic-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
        {/* agent identity glyphs (distinct silhouettes: sparkle / hexagon / prompt) */}
        <symbol id="ic-claude" viewBox="0 0 24 24"><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" /></symbol>
        <symbol id="ic-codex" viewBox="0 0 24 24">
          <path d="M12 3.4l7.4 4.3v8.6L12 20.6l-7.4-4.3V7.7z" />
          <circle cx="12" cy="12" r="2.1" />
        </symbol>
        <symbol id="ic-shell" viewBox="0 0 24 24"><path d="M6 8l4 4-4 4M13 16h5" /></symbol>
        {/* widgets / misc */}
        <symbol id="ic-copy" viewBox="0 0 24 24">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </symbol>
        <symbol id="ic-external" viewBox="0 0 24 24">
          <path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
        </symbol>
        <symbol id="ic-caret" viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6" /></symbol>
        <symbol id="ic-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
        <symbol id="ic-split" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M12 4.5v15" /></symbol>
        <symbol id="ic-image" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M20 15l-4.5-4L6 20" />
        </symbol>
        <symbol id="ic-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></symbol>
        {/* run/play — a solid triangle (filled override, like the dots): the
            clearest "execute" mark for the CommandCard's Run button */}
        <symbol id="ic-play" viewBox="0 0 24 24"><path d="M8 5.6v12.8L18.6 12z" fill="currentColor" stroke="none" /></symbol>
        <symbol id="ic-alert" viewBox="0 0 24 24">
          <path d="M12 4l9 16H3z" /><path d="M12 10v4.5" />
          <circle cx="12" cy="17.4" r="0.5" fill="currentColor" stroke="none" />
        </symbol>
        {/* added for React port: success check + folder (files tree) */}
        <symbol id="ic-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></symbol>
        <symbol id="ic-folder" viewBox="0 0 24 24">
          <path d="M3 8a2 2 0 0 1 2-2h3.4l1.8 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </symbol>
        {/* open folder — the back+tab of ic-folder with the front folded down/open */}
        <symbol id="ic-folder-open" viewBox="0 0 24 24">
          <path d="M3.5 17V7.5A1.5 1.5 0 0 1 5 6h3l1.8 2H18a1.5 1.5 0 0 1 1.5 1.5V11" />
          <path d="M3.5 17 5.6 10.8A1.6 1.6 0 0 1 7.13 9.6H21a1 1 0 0 1 .95 1.32L20.25 16.02A1.6 1.6 0 0 1 18.73 17Z" />
        </symbol>
        {/* explorer nav: home + edit-path (pencil) */}
        <symbol id="ic-home" viewBox="0 0 24 24">
          <path d="M4 11.5 12 5l8 6.5" />
          <path d="M6 10.2V18a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7.8" />
        </symbol>
        <symbol id="ic-pencil" viewBox="0 0 24 24">
          <path d="M4 20l1.3-4.2L15.4 5.7a2 2 0 0 1 2.9 2.9L8.2 18.7z" />
          <path d="M13.6 7.5l2.9 2.9" />
        </symbol>
        {/* Stage data widgets (WS-9): table · json · md · diff · progress */}
        {/* table — gridded plate: header row + first column dividers */}
        <symbol id="ic-table" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M10 9.5v10" />
        </symbol>
        {/* json — the { } code braces, meeting at a centred pivot */}
        <symbol id="ic-braces" viewBox="0 0 24 24">
          <path d="M9 4.5c-1.5 0-2 .8-2 2.2v1.8c0 .9-.6 1.5-1.5 1.5.9 0 1.5.6 1.5 1.5v1.8c0 1.4.5 2.2 2 2.2" />
          <path d="M15 4.5c1.5 0 2 .8 2 2.2v1.8c0 .9.6 1.5 1.5 1.5-.9 0-1.5.6-1.5 1.5v1.8c0 1.4-.5 2.2-2 2.2" />
        </symbol>
        {/* markdown — the M + down-caret mark inside a rounded plate */}
        <symbol id="ic-markdown" viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M6.5 15V9l2.75 3.2L12 9v6" />
          <path d="M15.5 9v4.2M13.6 12.3l1.9 2 1.9-2" />
        </symbol>
        {/* diff — additions (+) above deletions (−) */}
        <symbol id="ic-diff" viewBox="0 0 24 24">
          <path d="M6.5 5v5M4 7.5h5" />
          <path d="M15 16.5h5" />
        </symbol>
        {/* progress — a track with a filled left segment */}
        <symbol id="ic-progress" viewBox="0 0 24 24">
          <rect x="3.5" y="10" width="17" height="4" rx="2" />
          <rect x="3.5" y="10" width="9" height="4" rx="2" fill="currentColor" stroke="none" />
        </symbol>
        {/* pin — a pushpin (head bar · tapered body · needle) for kept cards */}
        <symbol id="ic-pin" viewBox="0 0 24 24">
          <path d="M8.5 3.5h7" />
          <path d="M10 3.5 9.4 9.5 6.5 12.3V13.7h11V12.3L14.6 9.5 14 3.5" />
          <path d="M12 13.7V20.5" />
        </symbol>
        {/* v3.1 · activity + broadcast + help — same stroke idiom as the set */}
        {/* bell — activity / notifications */}
        <symbol id="ic-bell" viewBox="0 0 24 24">
          <path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 1.8 5.7 1.8 5.7H4.2S6 14 6 9.5" />
          <path d="M10.2 19a2 2 0 0 0 3.6 0" />
        </symbol>
        {/* broadcast — radio tower: live center dot + paired waves (input mirrors) */}
        <symbol id="ic-broadcast" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M5.7 5.7a9 9 0 0 0 0 12.6M18.3 5.7a9 9 0 0 1 0 12.6" />
        </symbol>
        {/* keyboard — shortcut cheatsheet */}
        <symbol id="ic-keyboard" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="10.5" rx="2" />
          <path d="M7 10.8h.9M11.5 10.8h.9M16.1 10.8h.9M8 14h8" />
        </symbol>
        {/* info — the info notification kind (circle + stem + dot, ic-alert idiom) */}
        <symbol id="ic-info" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.4" />
          <path d="M12 11.2v4.6" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
        </symbol>
      </defs>
    </svg>
  );
}
