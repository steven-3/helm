/* ══════════════════════════════════════════════════════════════════════════
   NotificationCenter (v3.1) — the Activity drawer. A right-edge sheet over a
   --scrim: occasional, so it animates (drawerMotion x-slide + scrimMotion fade,
   §12.5 --dur-drawer/--ease-drawer); the Motion presets drop the transform and
   keep the fade under reduced motion via the root MotionConfig.

   Rows: kind glyph + status tone (never color alone — the icon carries it),
   title, 2-line-clamped body, relative timestamp. Unread rows take helm's 2px
   accent edge marker (the house "accent bar = state" idiom, same as roster
   selection). A row with a paneId jumps: surface its tab in the terminal
   workspace, focus the pane, close.

   markAllRead happens on CLOSE, not open: the badge means "unseen", and closing
   the drawer is the user finishing their review. Marking on open would zero the
   badge before a single row was read and erase the unread markers mid-scan.

   a11y mirrors the Settings modal: focus the panel on open, Tab trapped inside,
   Escape closes, prior focus restored on unmount (isConnected-guarded).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { drawerMotion, scrimMotion } from "../lib/motion";
import { useNotifications, type NotificationKind } from "../store/notifications";
import { usePanes } from "../store/panes";
import { useLayout } from "../store/layout";
import { useCheatsheet } from "../store/cheatsheet";
import { Icon, type IconName } from "./icons";

const KIND_META: Record<NotificationKind, { icon: IconName; tone: "ok" | "warn" | "err" | "info" }> = {
  "session-exit": { icon: "ic-check", tone: "ok" },
  bell: { icon: "ic-alert", tone: "warn" },
  card: { icon: "ic-image", tone: "info" },
  hook: { icon: "ic-shell", tone: "info" },
  error: { icon: "ic-alert", tone: "err" },
  info: { icon: "ic-info", tone: "info" },
};

function relTime(ts: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Close = the review is done: mark everything read, then slide out. */
function closeDrawer(): void {
  const state = useNotifications.getState();
  if (!state.panelOpen) return;
  state.markAllRead();
  state.togglePanel();
}

/** Pane jump: surface the pane's tab in the terminal workspace, then focus it. */
function jumpToPane(paneId: string): void {
  const pane = usePanes.getState().panes[paneId];
  if (!pane) return;
  usePanes.getState().setActiveTab(pane.tabId);
  usePanes.getState().focusPane(paneId);
  useLayout.getState().setWorkspaceView("terminal");
  closeDrawer();
}

function NotificationDrawer() {
  const items = useNotifications((s) => s.items);
  const unreadCount = useNotifications((s) => s.unreadCount);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const clear = useNotifications((s) => s.clear);
  const remove = useNotifications((s) => s.remove);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Relative timestamps stay honest while the drawer sits open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Focus trap + Escape, the Settings-modal idiom. One addition: Escape yields
  // to the cheatsheet, the one overlay that can stack above this drawer.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (useCheatsheet.getState().open) return; // the overlay above owns Escape
        event.preventDefault();
        closeDrawer();
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
  }, []);

  return (
    <m.div className="nc-scrim" onMouseDown={closeDrawer} {...scrimMotion}>
      <m.div
        className="nc-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Activity"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        {...drawerMotion}
      >
        <header className="nc-head">
          <h2 className="nc-title">Activity</h2>
          <button type="button" className="nc-act" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </button>
          <button type="button" className="nc-act" onClick={clear} disabled={items.length === 0}>
            Clear
          </button>
          <button type="button" className="nc-close" aria-label="Close activity" onClick={closeDrawer}>
            <Icon name="ic-close" size="sm" />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="nc-empty">
            <Icon name="ic-bell" />
            <span>Nothing yet</span>
          </div>
        ) : (
          <div className="nc-list" role="list" aria-label="Notifications">
            {items.map((item) => {
              const meta = KIND_META[item.kind];
              const content = (
                <>
                  <span className={`nc-ic ${meta.tone}`}>
                    <Icon name={meta.icon} size="sm" />
                  </span>
                  <span className="nc-main">
                    <span className="nc-row-title">{item.title}</span>
                    {item.body && <span className="nc-body">{item.body}</span>}
                  </span>
                  <span className="nc-time">{relTime(item.ts, now)}</span>
                </>
              );
              return (
                <div className={`nc-row${item.read ? "" : " unread"}`} role="listitem" key={item.id}>
                  {item.paneId ? (
                    <button type="button" className="nc-jump" onClick={() => jumpToPane(item.paneId!)}>
                      {content}
                    </button>
                  ) : (
                    <div className="nc-jump static">{content}</div>
                  )}
                  <button
                    type="button"
                    className="nc-x"
                    aria-label="Dismiss notification"
                    onClick={() => remove(item.id)}
                  >
                    <Icon name="ic-close" size="xs" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </m.div>
    </m.div>
  );
}

/** Store-driven mount; AnimatePresence lets scrim + drawer animate their exit. */
export function NotificationCenter() {
  const panelOpen = useNotifications((s) => s.panelOpen);
  return <AnimatePresence>{panelOpen && <NotificationDrawer />}</AnimatePresence>;
}
