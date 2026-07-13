import { Fragment, useEffect, useRef, useState } from "react";
import { usePanes } from "../store/panes";
import { Pane } from "./Pane";
import type { TerminalPaneProps } from "./TerminalPane";
import type { Pane as PaneModel, Tab } from "../lib/contract";

/** Flex ratios summing to 1; equal shares when absent/stale/degenerate. */
function normalizeSizes(sizes: number[] | undefined, n: number): number[] {
  if (!sizes || sizes.length !== n) return Array(n).fill(1 / n);
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return Array(n).fill(1 / n);
  return sizes.map((size) => size / sum);
}

interface DragState {
  k: number;
  horizontal: boolean;
  startCoord: number;
  startSizes: number[];
  span: number;
  tabId: string;
  cells: [HTMLElement, HTMLElement];
  latestSizes: number[];
  pendingCoord: number;
  frame: number | null;
}

const RESIZE_END_EVENT = "helm:pane-resize-end";
const MIN_PANE_PX = 180;
const DIVIDER_PX = 10;

function minimumPairRatio(span: number, pairTotal: number): number {
  if (!(span > 0) || !(pairTotal > 0)) return 0.1;
  const minimumSize = Math.min(0.45, MIN_PANE_PX / span);
  return Math.min(0.5, minimumSize / pairTotal);
}

function TabSurface({
  tab,
  visible,
  onTermReady,
}: {
  tab: Tab;
  visible: boolean;
  onTermReady?: TerminalPaneProps["onReady"];
}) {
  const panes = usePanes((state) => state.panes);
  const setTabSizes = usePanes((state) => state.setTabSizes);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [containerSpan, setContainerSpan] = useState(0);

  const horizontal = tab.split === "horizontal";
  const list = tab.paneIds
    .map((id) => panes[id])
    .filter((pane): pane is PaneModel => Boolean(pane));
  const sizes = normalizeSizes(tab.sizes, list.length);

  const applyDrag = (drag: DragState, coord: number) => {
    if (drag.span <= 0) return;
    let delta = (coord - drag.startCoord) / drag.span;
    const minFrac = Math.min(0.45, MIN_PANE_PX / drag.span);
    const lower = minFrac - drag.startSizes[drag.k];
    const upper = drag.startSizes[drag.k + 1] - minFrac;
    if (upper < lower) return;
    delta = Math.min(Math.max(delta, lower), upper);

    const next = [...drag.startSizes];
    next[drag.k] = drag.startSizes[drag.k] + delta;
    next[drag.k + 1] = drag.startSizes[drag.k + 1] - delta;
    drag.latestSizes = next;
    drag.cells[0].style.flex = `${next[drag.k]} 1 0%`;
    drag.cells[1].style.flex = `${next[drag.k + 1]} 1 0%`;
  };

  const clearResizeMode = () => {
    delete document.documentElement.dataset.paneResizing;
    window.dispatchEvent(new CustomEvent(RESIZE_END_EVENT));
  };

  useEffect(() => () => {
    const drag = dragRef.current;
    if (drag?.frame != null) cancelAnimationFrame(drag.frame);
    if (drag) clearResizeMode();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      setContainerSpan(horizontal ? rect.height : rect.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [horizontal]);

  const onDividerDown = (event: React.PointerEvent<HTMLDivElement>, index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const cells = Array.from(container.querySelectorAll<HTMLElement>(":scope > .split-cell"));
    const first = cells[index];
    const second = cells[index + 1];
    if (!first || !second) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
    document.documentElement.dataset.paneResizing = horizontal ? "row" : "column";
    const rect = container.getBoundingClientRect();
    const coord = horizontal ? event.clientY : event.clientX;
    const measuredSpan = horizontal ? rect.height : rect.width;
    const flexibleSpan = Math.max(0, measuredSpan - (sizes.length - 1) * DIVIDER_PX);
    dragRef.current = {
      k: index,
      horizontal,
      startCoord: coord,
      startSizes: sizes,
      span: flexibleSpan,
      tabId: tab.id,
      cells: [first, second],
      latestSizes: sizes,
      pendingCoord: coord,
      frame: null,
    };
  };

  const onDividerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pendingCoord = drag.horizontal ? event.clientY : event.clientX;
    if (drag.frame != null) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = null;
      applyDrag(drag, drag.pendingCoord);
    });
  };

  const onDividerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.frame != null) {
      cancelAnimationFrame(drag.frame);
      applyDrag(drag, drag.pendingCoord);
    }
    const divider = event.currentTarget;
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
    divider.classList.remove("dragging");
    setTabSizes(drag.tabId, drag.latestSizes);
    clearResizeMode();
  };

  const onDividerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    const decreaseKey = horizontal ? "ArrowUp" : "ArrowLeft";
    const increaseKey = horizontal ? "ArrowDown" : "ArrowRight";
    if (![decreaseKey, increaseKey, "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const pairTotal = sizes[index] + sizes[index + 1];
    if (!(pairTotal > 0)) return;
    const currentRatio = sizes[index] / pairTotal;
    const flexibleSpan = Math.max(0, containerSpan - (sizes.length - 1) * DIVIDER_PX);
    const minRatio = minimumPairRatio(flexibleSpan, pairTotal);
    const maxRatio = 1 - minRatio;
    const step = event.shiftKey ? 0.1 : 0.05;
    const nextRatio = event.key === "Home"
      ? minRatio
      : event.key === "End"
        ? maxRatio
        : Math.min(maxRatio, Math.max(minRatio, currentRatio + (event.key === increaseKey ? step : -step)));
    if (nextRatio === currentRatio) return;

    const next = [...sizes];
    next[index] = pairTotal * nextRatio;
    next[index + 1] = pairTotal * (1 - nextRatio);
    setTabSizes(tab.id, next);
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(RESIZE_END_EVENT)));
  };

  return (
    <div
      className={`split split-surface${horizontal ? " horizontal" : ""}${visible ? " active" : ""}`}
      ref={containerRef}
      role="tabpanel"
      id={`terminal-panel-${tab.id}`}
      aria-labelledby={`terminal-tab-${tab.id}`}
      aria-hidden={!visible}
    >
      {list.map((pane, index) => {
        const pairTotal = index > 0 ? sizes[index - 1] + sizes[index] : 0;
        const previousPercent = pairTotal > 0 ? Number(((sizes[index - 1] / pairTotal) * 100).toFixed(1)) : 50;
        const currentPercent = Number((100 - previousPercent).toFixed(1));
        const flexibleSpan = Math.max(0, containerSpan - (sizes.length - 1) * DIVIDER_PX);
        const minPercent = Number((minimumPairRatio(flexibleSpan, pairTotal) * 100).toFixed(1));

        return <Fragment key={pane.id}>
          {index > 0 && (
            <div
              className="split-divider"
              role="separator"
              aria-orientation={horizontal ? "horizontal" : "vertical"}
              aria-label={`Resize ${list[index - 1].title} and ${pane.title}`}
              aria-controls={`pane-cell-${list[index - 1].id} pane-cell-${pane.id}`}
              aria-valuemin={minPercent}
              aria-valuemax={100 - minPercent}
              aria-valuenow={previousPercent}
              aria-valuetext={`${previousPercent}% ${list[index - 1].title}, ${currentPercent}% ${pane.title}`}
              tabIndex={visible ? 0 : -1}
              onPointerDown={(event) => onDividerDown(event, index - 1)}
              onPointerMove={onDividerMove}
              onPointerUp={onDividerEnd}
              onPointerCancel={onDividerEnd}
              onLostPointerCapture={onDividerEnd}
              onKeyDown={(event) => onDividerKeyDown(event, index - 1)}
            />
          )}
          <div id={`pane-cell-${pane.id}`} className="split-cell" style={{ flex: `${sizes[index]} 1 0%` }}>
            <Pane pane={pane} visible={visible} onTermReady={onTermReady} />
          </div>
        </Fragment>;
      })}
    </div>
  );
}

/**
 * Every tab surface stays mounted for the lifetime of its panes. This preserves
 * xterm's alternate screen, scrollback, glyph atlas, and live PTY byte sink
 * across tab changes. Inactive xterm DOM is display-gated (not unmounted), so
 * hidden tabs consume no canvas paint work; activation performs a fit + refresh.
 */
export function SplitPanes({
  onTermReady,
  visible = true,
}: {
  onTermReady?: TerminalPaneProps["onReady"];
  visible?: boolean;
}) {
  const tabs = usePanes((state) => state.tabs);
  const activeTabId = usePanes((state) => state.activeTabId);

  return (
    <div className="tab-surfaces">
      {tabs.map((tab) => (
        <TabSurface
          key={tab.id}
          tab={tab}
          visible={visible && tab.id === activeTabId}
          onTermReady={onTermReady}
        />
      ))}
    </div>
  );
}
