/* ══════════════════════════════════════════════════════════════════════════
   SplitPanes — renders the ACTIVE tab's panes (only the active tab mounts an
   xterm, so we never instantiate terminals for hidden tabs). The 1px flex gap
   over a surface reveals the border-subtle divider between panes; horizontal
   splits stack. onTermReady is threaded to each pane for the Phase-3 PTY seam.
   ══════════════════════════════════════════════════════════════════════════ */
import { usePanes } from "../store/panes";
import { Pane } from "./Pane";
import type { TerminalPaneProps } from "./TerminalPane";
import type { Pane as PaneModel } from "../lib/contract";

export function SplitPanes({ onTermReady }: { onTermReady?: TerminalPaneProps["onReady"] }) {
  const activeTab = usePanes((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const panes = usePanes((s) => s.panes);

  if (!activeTab) return <div className="split" />;

  const list = activeTab.paneIds
    .map((id) => panes[id])
    .filter((p): p is PaneModel => Boolean(p));

  return (
    <div className={`split${activeTab.split === "horizontal" ? " horizontal" : ""}`}>
      {list.map((p) => (
        <Pane key={p.id} pane={p} onTermReady={onTermReady} />
      ))}
    </div>
  );
}
