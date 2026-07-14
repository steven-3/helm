/* ══════════════════════════════════════════════════════════════════════════
   Stage dock (e1) — the right widget dock (DESIGN.md §4.3, the differentiator).
   Visibility is driven by useLayout.stageOpen (App renders a slim reveal strip
   when collapsed; pushWidget auto-reveals). Renders useStage widgets for the
   focused pane (active tab's active pane); header + collapse; tasteful empty
   state when the focused pane has surfaced nothing.

   WS-6 additions: the "command" (CommandCard) + "widget" (sandboxed iframe) card
   cases; a per-card hover dismiss (×); a head "Clear" control (both drive the
   existing useStage.dismiss / clearPane the store already owns).
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

/* Positioning wrapper carrying the hover-revealed dismiss (×). The wrapper stays a
   plain <div> (not a motion element) so the card's OWN cardMotion still drives the
   AnimatePresence enter/exit through nested presence — the wrapper never double-
   animates the scale. */
function WidgetView({ widget }: { widget: StageWidget }) {
  return (
    <div className="stage-card">
      {widgetCard(widget)}
      <button
        type="button"
        className="card-dismiss"
        aria-label={`Dismiss ${widget.type}`}
        onClick={() => useStage.getState().dismiss(widget.id)}
      >
        <Icon name="ic-close" className="icon xs" />
      </button>
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
  const paneWidgets = focused ? widgets.filter((w) => w.paneId === focused.id) : [];

  return (
    // Dock reveal/collapse motion (§8, occasional): x-slide + opacity, driven by
    // App's <AnimatePresence mode="wait">. transform/opacity only — never width.
    <m.aside className="stage" aria-label="Stage" {...dockMotion}>
      <div className="stage-head">
        <span className="stage-title">Stage</span>
        <div className="stage-tools">
          {/* Clear — surfaces the store's clearPane; shown only when the focused
              pane actually has cards to clear (no dead control on an empty dock). */}
          {focused && paneWidgets.length > 0 && (
            <button
              type="button"
              className="stage-clear"
              onClick={() => useStage.getState().clearPane(focused.id)}
            >
              Clear
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
          {paneWidgets.map((w) => <WidgetView key={w.id} widget={w} />)}
        </AnimatePresence>
        {paneWidgets.length === 0 && (
          <div className="stage-empty">
            <Icon name="ic-image" className="icon" />
            <span className="se-title">no widgets surfaced</span>
            <span className="se-sub">agents surface copy · link · image · command cards here</span>
          </div>
        )}
      </div>
    </m.aside>
  );
}
