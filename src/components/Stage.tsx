/* ══════════════════════════════════════════════════════════════════════════
   Stage dock (e1) — the right widget dock (DESIGN.md §4.3, the differentiator).
   Visibility is driven by useLayout.stageOpen (App renders a slim reveal strip
   when collapsed; pushWidget auto-reveals). Renders useStage widgets for the
   focused pane (active tab's active pane); header + collapse; tasteful empty
   state when the focused pane has surfaced nothing.
   ══════════════════════════════════════════════════════════════════════════ */
import { useLayout } from "../store/layout";
import { usePanes } from "../store/panes";
import { useStage } from "../store/stage";
import { CopyBox } from "./CopyBox";
import { LinkCard } from "./LinkCard";
import { ImagePreview } from "./ImagePreview";
import { Icon } from "./icons";
import type { StageWidget } from "../lib/contract";

function WidgetView({ widget }: { widget: StageWidget }) {
  switch (widget.type) {
    case "copy": return <CopyBox widget={widget} />;
    case "link": return <LinkCard widget={widget} />;
    case "img": return <ImagePreview widget={widget} />;
    default:
      return (
        <div className="card">
          <div className="card-head">
            <span className="card-kind"><Icon name="ic-image" className="icon xs" />WIDGET</span>
          </div>
          <div className="card-hint">custom widget</div>
        </div>
      );
  }
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
    <aside className="stage" aria-label="Stage">
      <div className="stage-head">
        <span className="stage-title">STAGE</span>
        <button className="stage-collapse" aria-label="Collapse Stage" onClick={closeStage}>
          <Icon name="ic-chev" size="sm" />
        </button>
      </div>
      <div className="stage-sub">
        {focused ? `auto-revealed · surfaced by ${focused.title}` : "no active pane"}
      </div>

      <div className="stage-body">
        {paneWidgets.length === 0 ? (
          <div className="stage-empty">
            <Icon name="ic-image" className="icon" />
            <span className="se-title">no widgets surfaced</span>
            <span className="se-sub">agents surface copy · link · image cards here</span>
          </div>
        ) : (
          paneWidgets.map((w) => <WidgetView key={w.id} widget={w} />)
        )}
      </div>
    </aside>
  );
}
