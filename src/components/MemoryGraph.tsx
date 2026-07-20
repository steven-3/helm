/* ══════════════════════════════════════════════════════════════════════════
   MemoryGraph (§4.6 · U3) — the link graph as a self-contained SVG, seat-colored.

   useMemory.graph() gives nodes + edges (edges are the resolved links[]); a
   force-lite layout runs in an effect — NO d3. It is a deterministic mini
   sim (seeded ring start + hashed jitter, ~100 iterations of pairwise repulsion
   + edge springs + centre gravity, then a bounding-box fit into the fixed
   viewBox), so the same memory set always draws the same picture and the SVG
   stays resolution-independent (viewBox scales, no container measurement).

   Each node = a seat-colored dot + its slug label; the hue is the AUTHOR's seat
   via the shared seatHueFor() resolver (board cards + mission tree use the same
   one, so a seat is one color everywhere). Identity is never color alone — the
   slug word rides every node. Click / Enter selects the entry; the parent view
   swaps its detail pane. Empty graph → the quiet "nothing linked yet" state.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { useMemory } from "../store/memory";
import { useModelHub } from "../store/modelhub";
import { seatHueFor } from "./BoardCard";
import "../styles/memory.css";

/* Fixed layout space — the SVG viewBox; positions fit into it with padding. */
const VW = 1000;
const VH = 700;
const PAD = 60;
const ITERATIONS = 100;
const REPULSION = 9000;
const SPRING_LEN = 150;
const SPRING_K = 0.03;
const GRAVITY = 0.02;
const MAX_STEP = 42;
const DAMPING = 0.85;

type Pt = { x: number; y: number };

/** Deterministic 0..1 hash of a string — the seeded jitter source. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

interface Layout {
  pos: Record<string, Pt>;
  ids: string[];
  edges: { from: string; to: string }[];
}

/** Force-lite: seeded ring → repulsion + springs + gravity → fit to viewBox. */
function computeLayout(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
): Layout {
  const ids = nodes.map((n) => n.id);
  const n = ids.length;
  const cx = VW / 2;
  const cy = VH / 2;
  const index = new Map(ids.map((id, i) => [id, i]));
  const pos: Pt[] = ids.map((id, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    const r = 220 + hash01(id) * 50;
    return {
      x: cx + Math.cos(angle) * r + (hash01(`${id}:x`) - 0.5) * 40,
      y: cy + Math.sin(angle) * r + (hash01(`${id}:y`) - 0.5) * 40,
    };
  });

  const validEdges = edges.filter((e) => index.has(e.from) && index.has(e.to));

  if (n > 1) {
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const disp: Pt[] = pos.map(() => ({ x: 0, y: 0 }));
      // pairwise repulsion (Coulomb)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x;
          let dy = pos[i].y - pos[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = (hash01(`${ids[i]}${ids[j]}`) - 0.5) * 2;
            dy = (hash01(`${ids[j]}${ids[i]}`) - 0.5) * 2;
            d2 = dx * dx + dy * dy + 0.01;
          }
          const d = Math.sqrt(d2);
          const f = REPULSION / d2;
          const ux = (dx / d) * f;
          const uy = (dy / d) * f;
          disp[i].x += ux;
          disp[i].y += uy;
          disp[j].x -= ux;
          disp[j].y -= uy;
        }
      }
      // edge springs (attraction toward SPRING_LEN)
      for (const edge of validEdges) {
        const i = index.get(edge.from)!;
        const j = index.get(edge.to)!;
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - SPRING_LEN) * SPRING_K;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        disp[i].x += ux;
        disp[i].y += uy;
        disp[j].x -= ux;
        disp[j].y -= uy;
      }
      // centre gravity + damped step
      for (let i = 0; i < n; i++) {
        disp[i].x += (cx - pos[i].x) * GRAVITY;
        disp[i].y += (cy - pos[i].y) * GRAVITY;
        pos[i].x += Math.max(-MAX_STEP, Math.min(MAX_STEP, disp[i].x)) * DAMPING;
        pos[i].y += Math.max(-MAX_STEP, Math.min(MAX_STEP, disp[i].y)) * DAMPING;
      }
    }
  }

  // fit bounding box into the padded viewBox — layout looks right at any scale
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((VW - PAD * 2) / spanX, (VH - PAD * 2) / spanY);
  const offX = (VW - spanX * scale) / 2;
  const offY = (VH - spanY * scale) / 2;
  const out: Record<string, Pt> = {};
  ids.forEach((id, i) => {
    out[id] = {
      x: (pos[i].x - minX) * scale + offX,
      y: (pos[i].y - minY) * scale + offY,
    };
  });
  return { pos: out, ids, edges: validEdges };
}

export function MemoryGraph({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const index = useMemory((s) => s.index);
  const graph = useMemory((s) => s.graph);
  const seats = useModelHub((s) => s.seats);
  const [layout, setLayout] = useState<Layout>({ pos: {}, ids: [], edges: [] });

  // Layout runs in an effect (not on every render); its key is the node set +
  // edge set, so it recomputes only when the graph shape actually changes.
  const graphData = graph();
  const signature =
    graphData.nodes.map((node) => node.id).join("|") +
    "::" +
    graphData.edges.map((edge) => `${edge.from}>${edge.to}`).join("|");

  useEffect(() => {
    setLayout(computeLayout(graphData.nodes, graphData.edges));
    // signature captures node + edge identity; graphData is a fresh object each
    // render, so we key the effect on the stable signature string instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const byName = new Map(index.map((entry) => [entry.name, entry]));

  if (layout.ids.length === 0) {
    return (
      <div className="mgraph-empty">
        <span className="mgraph-empty-title">Nothing linked yet</span>
        <span className="mgraph-empty-sub">
          Memories connect here once entries reference each other.
        </span>
      </div>
    );
  }

  return (
    <div className="mgraph">
      <svg
        className="mgraph-svg"
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Memory link graph"
      >
        <g className="mgraph-edges">
          {layout.edges.map((edge, i) => {
            const a = layout.pos[edge.from];
            const b = layout.pos[edge.to];
            if (!a || !b) return null;
            const active = selected === edge.from || selected === edge.to;
            return (
              <line
                key={`${edge.from}-${edge.to}-${i}`}
                className={`mgraph-edge${active ? " active" : ""}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
              />
            );
          })}
        </g>
        <g className="mgraph-nodes">
          {layout.ids.map((id) => {
            const p = layout.pos[id];
            if (!p) return null;
            const entry = byName.get(id);
            const hue =
              seatHueFor(entry?.author.seat, seats) ??
              seatHueFor(entry?.author.agent, seats);
            const isSel = selected === id;
            return (
              <g
                key={id}
                className={`mgraph-node${isSel ? " sel" : ""}`}
                data-seat={hue}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Memory ${id}${entry?.description ? `: ${entry.description}` : ""}`}
                aria-pressed={isSel}
                onClick={() => onSelect(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(id);
                  }
                }}
              >
                <circle className="mgraph-hit" r={22} />
                <circle className="mgraph-dot" r={isSel ? 9 : 6} />
                <text className="mgraph-label" y={24}>
                  {id.length > 22 ? `${id.slice(0, 21)}…` : id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
