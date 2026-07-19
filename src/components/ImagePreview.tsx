/* ══════════════════════════════════════════════════════════════════════════
   ImagePreview (Stage hero widget) — if payload.b64 is present, render it
   inline; otherwise read the REAL file via commands.readFileBase64 (Rust
   fs.rs) and render the data URL it returns (SVG included — a data URL needs
   no decoder). The backend rejects whole-file reads past the byte cap rather
   than truncating, so the error state is honest: the real error string in the
   danger text tier, plus the configured preview limit when the failure is a
   size rejection. Loading is a fixed-aspect framed skeleton (the .img-ph
   plate: icon + filename + status), so the card never flashes or reflows.
   Arrival motion is the shared cardMotion (§8: opacity 0→1 + scale .97→1),
   driven by Motion via the <AnimatePresence> in Stage — not CSS.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { m } from "motion/react";
import { readFileBase64 } from "../lib/commands";
import { cardMotion } from "../lib/motion";
import { useLightbox } from "../store/lightbox";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscImg, StageWidget } from "../lib/contract";

/* The preview byte cap, passed explicitly so the error state's displayed
   limit can never drift from the value the backend enforces. */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LABEL = "10 MB";

type Load =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

/** Size-rejection heuristic: the backend's own words decide whether the
    "preview limit" line is relevant (vs. an unreadable/missing file). */
const SIZE_RE = /exceed|too large|maxbytes|max_bytes|byte|size|limit/i;

export function ImagePreview({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscImg;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const [load, setLoad] = useState<Load>(() =>
    p.b64
      ? { status: "ready", url: `data:${p.mime ?? "image/png"};base64,${p.b64}` }
      : { status: "loading" },
  );

  useEffect(() => {
    if (p.b64) return;
    if (!p.path) { setLoad({ status: "error", message: "No file path" }); return; }
    let alive = true;
    (async () => {
      try {
        const img = await readFileBase64(p.path!, MAX_BYTES);
        if (alive) setLoad({ status: "ready", url: `data:${img.mime};base64,${img.base64}` });
      } catch (err) {
        if (alive) {
          setLoad({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { alive = false; };
  }, [p.b64, p.path, p.mime]);

  const filename = (p.path ? p.path.split(/[\\/]/).pop() : undefined) ?? "image";
  const d = new Date(widget.ts);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-image" className="icon xs" />Image</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>
      <div className="img-frame" aria-busy={load.status === "loading"}>
        {load.status === "ready" ? (
          // Click / Enter / Space → open the store-driven full-window lightbox
          // (WS-6). role=button + tabIndex make the img a real, keyboard-reachable
          // control; the zoom-in cursor signals it expands.
          <img
            className="img-el"
            src={load.url}
            alt={filename}
            role="button"
            tabIndex={0}
            title="Open full size"
            onClick={() => useLightbox.getState().open(load.url, filename)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                useLightbox.getState().open(load.url, filename);
              }
            }}
          />
        ) : load.status === "loading" ? (
          // Skeleton: the fixed-aspect plate holds the card's shape while the
          // bytes stream in — no flash, no reflow when the image lands.
          <div className="img-ph">
            <Icon name="ic-image" className="icon" />
            <span className="img-ph-name">{filename}</span>
            <span className="img-ph-hint">LOADING…</span>
          </div>
        ) : (
          <div className="img-ph">
            <Icon name="ic-alert" className="icon" style={{ color: "var(--status-danger-text)" }} />
            <span className="img-ph-name">{filename}</span>
            <span
              className="img-ph-hint"
              style={{
                color: "var(--status-danger-text)",
                maxWidth: "88%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={load.message}
            >
              {load.message}
            </span>
            {SIZE_RE.test(load.message) && (
              <span className="img-ph-hint">Preview limit {MAX_LABEL}</span>
            )}
          </div>
        )}
      </div>
      <div className="img-cap tnum">{filename} · {time}</div>
    </m.div>
  );
}
