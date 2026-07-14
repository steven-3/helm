/* ══════════════════════════════════════════════════════════════════════════
   Stage dock (e1) — the right widget dock (DESIGN.md §4.3, the differentiator).
   Visibility is driven by useLayout.stageOpen (App renders a slim reveal strip
   when collapsed; pushWidget auto-reveals). Renders useStage widgets for the
   focused pane (active tab's active pane); header + collapse; tasteful empty
   state when the focused pane has surfaced nothing.

   WS-6 additions: the "command" (CommandCard) + "widget" (sandboxed iframe) card
   cases; a per-card hover dismiss (×); a head "Clear" control (both drive the
   existing useStage.dismiss / clearPane the store already owns).

   WS-9 additions: the five display widgets — table · json · md · diff · progress;
   per-card PIN (excludes a card from the FIFO cap + Clear, sorts it to the top);
   "Clear" now clears UNPINNED cards only.
   ══════════════════════════════════════════════════════════════════════════ */
import { m, AnimatePresence } from "motion/react";
import { useLayout } from "../store/layout";
import { usePanes } from "../store/panes";
import { useStage } from "../store/stage";
import { cardMotion, dockMotion } from "../lib/motion";
import { CopyBox } from "./CopyBox";
import { LinkCard } from "./LinkCard";
import { ImagePreview } from "./ImagePreview";
import { FilePreview } from "./FilePreview";
import { CommandCard } from "./CommandCard";
import { ConfirmCard } from "./ConfirmCard";
import { ChoiceCard } from "./ChoiceCard";
import { AskCard } from "./AskCard";
import { TableCard } from "./TableCard";
import { JsonCard } from "./JsonCard";
import { MdCard } from "./MdCard";
import { DiffCard } from "./DiffCard";
import { ProgressCard } from "./ProgressCard";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscWidget, StageWidget } from "../lib/contract";

/* Untrusted program-supplied HTML (OscWidget.html). SECURITY (WS-6, load-bearing):
   the iframe `sandbox` attribute is EMPTY — no allow-scripts, no allow-same-origin
   — so HTML/CSS paints but every script is inert and the frame runs at a unique
   opaque origin: it cannot reach cookies/localStorage, the Tauri IPC, or helm's
   own DOM. Height-capped with internal scroll so a tall widget can't blow out the
   dock. */
function WidgetFrame({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscWidget;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-image" className="icon xs" />Widget</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>
      <div className="widget-frame">
        <iframe className="widget-iframe" sandbox="" srcDoc={p.html} title="widget" />
      </div>
    </m.div>
  );
}

/** Pick the card for a widget's type. Returns just the card; WidgetView wraps it. */
function widgetCard(widget: StageWidget) {
  switch (widget.type) {
    case "copy": return <CopyBox widget={widget} />;
    case "link": return <LinkCard widget={widget} />;
    case "img": return <ImagePreview widget={widget} />;
    case "file": return <FilePreview widget={widget} />;
    case "command": return <CommandCard widget={widget} />;
    case "confirm": return <ConfirmCard widget={widget} />;
    case "choice": return <ChoiceCard widget={widget} />;
    case "ask": return <AskCard widget={widget} />;
    case "table": return <TableCard widget={widget} />;
    case "json": return <JsonCard widget={widget} />;
    case "md": return <MdCard widget={widget} />;
    case "diff": return <DiffCard widget={widget} />;
    case "progress": return <ProgressCard widget={widget} />;
    case "widget": return <WidgetFrame widget={widget} />;
    default:
      return (
        <m.div className="card" {...cardMotion}>
          <div className="card-head">
            <span className="card-kind"><Icon name="ic-image" className="icon xs" />Widget</span>
          </div>
          <div className="card-hint">unrecognised widget</div>
        </m.div>
      );
  }
}

/* Positioning wrapper carrying the hover-revealed corner controls (pin + dismiss).
   The wrapper stays a plain <div> (not a motion element) so the card's OWN
   cardMotion still drives the AnimatePresence enter/exit through nested presence —
   the wrapper never double-animates the scale. A pinned card also carries a quiet
   2px indigo top edge (the §7 "kept/selected" accent marker) so its state reads at
   a glance across the stack, not only on hover. */
function WidgetView({ widget, pinned }: { widget: StageWidget; pinned: boolean }) {
  return (
    <div className={`stage-card${pinned ? " pinned" : ""}`}>
      {widgetCard(widget)}
      <div className="card-tools">
        <button
          type="button"
          className={`card-tool card-pin${pinned ? " is-pinned" : ""}`}
          aria-label={pinned ? `Unpin ${widget.type}` : `Pin ${widget.type}`}
          aria-pressed={pinned}
          onClick={() => useStage.getState().togglePin(widget.id)}
        >
          <Icon name="ic-pin" className="icon xs" />
        </button>
        <button
          type="button"
          className="card-tool card-dismiss"
          aria-label={`Dismiss ${widget.type}`}
          onClick={() => useStage.getState().dismiss(widget.id)}
        >
          <Icon name="ic-close" className="icon xs" />
        </button>
      </div>
    </div>
  );
}

export function Stage() {
  const closeStage = useLayout((s) => s.closeStage);
  const focused = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ? s.panes[tab.activePaneId] : undefined;
  });
  const widgets = useStage((s) => s.widgets);
  const pinnedIds = useStage((s) => s.pinnedIds);
  const paneWidgets = focused ? widgets.filter((w) => w.paneId === focused.id) : [];

  // Pinned first, then the rest — a STABLE partition, so insertion order (the
  // existing ordering) is preserved within each group. filter() keeps order.
  const pinnedWidgets = paneWidgets.filter((w) => pinnedIds.has(w.id));
  const looseWidgets = paneWidgets.filter((w) => !pinnedIds.has(w.id));
  const ordered = pinnedWidgets.length ? [...pinnedWidgets, ...looseWidgets] : paneWidgets;
  const hasUnpinned = looseWidgets.length > 0;

  return (
    // Dock reveal/collapse motion (§8, occasional): x-slide + opacity, driven by
    // App's <AnimatePresence mode="wait">. transform/opacity only — never width.
    <m.aside className="stage" aria-label="Stage" {...dockMotion}>
      <div className="stage-head">
        <span className="stage-title">Stage</span>
        <div className="stage-tools">
          {/* Clear — clears UNPINNED cards only (pinned survive, by design). Shown
              only when the focused pane actually has unpinned cards to clear, so it
              is never a dead control. The label names the exception only when a pin
              exists; the accessible name always spells it out. */}
          {focused && hasUnpinned && (
            <button
              type="button"
              className="stage-clear"
              aria-label="Clear unpinned cards"
              onClick={() => useStage.getState().clearPane(focused.id)}
            >
              {pinnedWidgets.length > 0 ? "Clear unpinned" : "Clear"}
            </button>
          )}
          <button className="stage-collapse" aria-label="Collapse Stage" onClick={closeStage}>
            <Icon name="ic-chev" size="sm" />
          </button>
        </div>
      </div>
      <div className="stage-sub" title={focused?.title}>
        {focused ? focused.title : "no active pane"}
      </div>

      <div className="stage-body">
        {/* AnimatePresence stays mounted so the LAST card (or a pane-switch swap)
            still animates its exit; the empty state renders once widgets are 0. */}
        <AnimatePresence>
          {ordered.map((w) => <WidgetView key={w.id} widget={w} pinned={pinnedIds.has(w.id)} />)}
        </AnimatePresence>
        {paneWidgets.length === 0 && (
          <div className="stage-empty">
            <Icon name="ic-image" className="icon" />
            <span className="se-title">no widgets surfaced</span>
            <span className="se-sub">agents surface copy · link · table · diff cards here</span>
          </div>
        )}
      </div>
    </m.aside>
  );
}
