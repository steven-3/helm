/* ══════════════════════════════════════════════════════════════════════════
   BlockGutter — slim overlay strip at the LEFT edge of a pane's terminal well:
   one chip per command block, pixel-aligned to the block's start marker row
   relative to the live viewport. Status = glyph + color (§4.4, never color
   alone): ✓ success / ✗ failure / ● pending (pulse — the one ambient motion,
   a pending command IS "running") / ▲ ended-by-signal. Agent-turn blocks wear
   the pane's agent glyph in the agent color instead (§5.2). Click selects +
   scrolls; the SELECTED chip reveals a floating action column (copy cmd /
   copy output / copy turn-md for agent turns / collapse). A jump-to-last-
   agent-turn button pins to the strip bottom when any agent turn exists.

   NO Warp-style block re-chroming: the scrollback stays a terminal; this is a
   transparent overlay (no background plate) that takes zero layout space.
   Mounted by the pane wrapper inside .term-pane (position:relative); chip
   alignment is measured from .xterm-rows' own rect, so it is exact regardless
   of xterm padding or where the strip sits in the flex column.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { useBlocks, type CommandBlock } from "../store/blocks";
import { getBlockOutput, scrollToBlock, copyBlockTurnMarkdown } from "../lib/blocks";
import { clipboardWrite } from "../lib/commands";
import { usePanes } from "../store/panes";
import { agentVis } from "./agent-view";
import { Icon, type IconName } from "./icons";

export interface BlockGutterProps {
  paneId: string;
  term: Terminal;
}

type BlockStatus = "pending" | "success" | "failure" | "ended";

/** exitCode contract: undefined = still running, null = killed by signal,
    0 = success, anything else = failure. */
function statusOf(block: CommandBlock): BlockStatus {
  if (block.exitCode === undefined) return "pending";
  if (block.exitCode === null) return "ended";
  return block.exitCode === 0 ? "success" : "failure";
}

const STATUS_WORD: Record<BlockStatus, string> = {
  pending: "running",
  success: "succeeded",
  failure: "failed",
  ended: "ended",
};

const STATUS_ICON: Record<BlockStatus, IconName> = {
  pending: "ic-shell",
  success: "ic-check",
  failure: "ic-close",
  ended: "ic-alert",
};

const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

const CHIP_H = 14;

interface ChipGeom {
  /** px from the strip's top edge to buffer row 0's top edge. */
  originTop: number;
  cellH: number;
}

export function BlockGutter({ paneId, term }: BlockGutterProps) {
  const blocks = useBlocks((s) => s.bySession[paneId]);
  const selectedId = useBlocks((s) => s.selectedBySession[paneId]);
  const selectBlock = useBlocks((s) => s.selectBlock);
  const toggleCollapsed = useBlocks((s) => s.toggleCollapsed);
  const paneAgent = usePanes((s) => s.panes[paneId]?.agent);

  const stripRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<ChipGeom>({ originTop: 0, cellH: 0 });
  const [viewportY, setViewportY] = useState(0);
  const [altBuffer, setAltBuffer] = useState(false);
  const [, setLineTick] = useState(0);

  /* Chip alignment = the rows element's own rect minus the strip's rect —
     immune to xterm padding, pane-head height, and mount-point drift. */
  const measure = useCallback(() => {
    const strip = stripRef.current;
    const rowsEl = term.element?.querySelector<HTMLElement>(".xterm-rows");
    if (!strip || !rowsEl || term.rows <= 0) return;
    const rowsRect = rowsEl.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const cellH = rowsRect.height / term.rows;
    if (!(cellH > 0)) return;
    setGeom((prev) =>
      prev.originTop === rowsRect.top - stripRect.top && prev.cellH === cellH
        ? prev
        : { originTop: rowsRect.top - stripRect.top, cellH },
    );
  }, [term]);

  useEffect(() => {
    setViewportY(term.buffer.active.viewportY);
    setAltBuffer(term.buffer.active.type === "alternate");
    const frame = requestAnimationFrame(measure);

    // Scrollback growth shifts absolute marker lines; re-render throttled to
    // one setState per frame so heavy output can't storm React.
    let feedFrame: number | null = null;
    const disposers = [
      term.onScroll((y) => setViewportY(y)),
      term.onLineFeed(() => {
        if (feedFrame != null) return;
        feedFrame = requestAnimationFrame(() => {
          feedFrame = null;
          setLineTick((t) => t + 1);
        });
      }),
    ];
    disposers.push(
      term.buffer.onBufferChange((buf) => {
        setAltBuffer(buf.type === "alternate");
        setViewportY(buf.viewportY);
        measure();
      }),
    );

    const observer = term.element
      ? new ResizeObserver(() => measure())
      : null;
    if (term.element && observer) observer.observe(term.element);

    return () => {
      cancelAnimationFrame(frame);
      if (feedFrame != null) cancelAnimationFrame(feedFrame);
      disposers.forEach((d) => d.dispose());
      observer?.disconnect();
    };
  }, [term, measure]);

  const list = blocks ?? [];
  const lastAgentTurn = (() => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].agentTurn) return list[i];
    return undefined;
  })();

  if (list.length === 0 || altBuffer) return null;

  const vis = agentVis(paneAgent ?? "shell");

  const jumpTo = (block: CommandBlock) => {
    selectBlock(paneId, block.id);
    scrollToBlock(term, block);
  };

  const copy = (text: string) => void clipboardWrite(text).catch(() => {});

  return (
    <div className="block-gutter" ref={stripRef} role="list" aria-label="Command blocks">
      {list.map((block) => {
        const marker = block.startMarker;
        if (!marker || marker.isDisposed || geom.cellH <= 0) return null;
        const row = marker.line - viewportY;
        if (row < 0 || row >= term.rows) return null;

        const status = statusOf(block);
        const selected = block.id === selectedId;
        const top = geom.originTop + row * geom.cellH + (geom.cellH - CHIP_H) / 2;
        const cmdLabel = block.cmd.trim() || "(empty command)";
        const label = block.agentTurn
          ? `Agent turn: ${cmdLabel} · ${STATUS_WORD[status]}`
          : `${cmdLabel} · ${STATUS_WORD[status]}`;

        const cls = [
          "bg-chip",
          block.agentTurn ? `agent ${vis.key}` : status,
          selected ? "selected" : "",
          block.collapsed ? "collapsed" : "",
        ].filter(Boolean).join(" ");

        return (
          <div key={block.id} role="listitem" className="bg-slot" style={{ top }}>
            <button
              type="button"
              className={cls}
              aria-label={label}
              aria-pressed={selected}
              title={`${label}\n${fullFmt.format(block.ts)}`}
              onClick={() => jumpTo(block)}
            >
              {block.agentTurn ? (
                <Icon name={vis.glyph} size="xs" />
              ) : status === "pending" ? (
                <i className="bg-dot pulse" aria-hidden="true" />
              ) : (
                <Icon name={STATUS_ICON[status]} size="xs" />
              )}
            </button>

            {selected && (
              <div className="bg-actions" role="group" aria-label={`Actions for ${cmdLabel}`}>
                <button
                  type="button"
                  aria-label="Copy command"
                  title="Copy command"
                  onClick={() => copy(block.cmd)}
                >
                  <Icon name="ic-shell" size="xs" />
                </button>
                <button
                  type="button"
                  aria-label="Copy output"
                  title="Copy output"
                  onClick={() => copy(getBlockOutput(term, block))}
                >
                  <Icon name="ic-copy" size="xs" />
                </button>
                {block.agentTurn && (
                  <button
                    type="button"
                    aria-label="Copy turn as markdown"
                    title="Copy turn as markdown"
                    onClick={() => copy(copyBlockTurnMarkdown(term, block))}
                  >
                    <Icon name="ic-markdown" size="xs" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={block.collapsed ? "Expand block" : "Collapse block"}
                  aria-pressed={Boolean(block.collapsed)}
                  title={block.collapsed ? "Expand block" : "Collapse block"}
                  onClick={() => {
                    toggleCollapsed(paneId, block.id);
                    if (!block.collapsed && block.endMarker && !block.endMarker.isDisposed) {
                      term.scrollToLine(block.endMarker.line);
                    }
                  }}
                >
                  <Icon name="ic-chev" size="xs" className={`icon xs${block.collapsed ? " flip" : ""}`} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {lastAgentTurn && (
        <button
          type="button"
          className={`bg-jump ${vis.key}`}
          aria-label="Jump to last agent turn"
          title="Jump to last agent turn"
          onClick={() => jumpTo(lastAgentTurn)}
        >
          <Icon name={vis.glyph} size="xs" />
          <Icon name="ic-caret" size="xs" />
        </button>
      )}
    </div>
  );
}
