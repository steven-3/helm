/* ══════════════════════════════════════════════════════════════════════════
   ImagePreview (Stage hero widget) — if payload.b64 is present, render it inline;
   otherwise call commands.imageRead(path) and render the returned bytes. While
   loading, or if the read fails (Rust FS backend may be pending), show a tasteful
   framed placeholder (glyph + filename + status) — never a crash, never an empty
   box. Arrival motion is inherited from .card (§8: opacity 0→1 + scale .97→1).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { imageRead } from "../lib/commands";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscImg, StageWidget } from "../lib/contract";

type Load = { status: "loading" | "ready" | "error"; url?: string };

export function ImagePreview({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscImg;
  const src = agentVis(widget.agent);
  const [load, setLoad] = useState<Load>(() =>
    p.b64 ? { status: "ready", url: `data:${p.mime ?? "image/png"};base64,${p.b64}` } : { status: "loading" },
  );

  useEffect(() => {
    if (p.b64) return;
    if (!p.path) { setLoad({ status: "error" }); return; }
    let alive = true;
    (async () => {
      try {
        const img = await imageRead(p.path!);
        if (alive) setLoad({ status: "ready", url: `data:${img.mime};base64,${img.b64}` });
      } catch {
        if (alive) setLoad({ status: "error" }); // backend pending — show placeholder
      }
    })();
    return () => { alive = false; };
  }, [p.b64, p.path, p.mime]);

  const filename = (p.path ? p.path.split("/").pop() : undefined) ?? "image";
  const d = new Date(widget.ts || Date.now());
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-image" className="icon xs" />IMAGE</span>
        <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
      </div>
      <div className="img-frame">
        {load.status === "ready" && load.url ? (
          <img className="img-el" src={load.url} alt={filename} />
        ) : (
          <div className="img-ph">
            <Icon name="ic-image" className="icon" />
            <span className="img-ph-name">{filename}</span>
            <span className="img-ph-hint">{load.status === "loading" ? "LOADING…" : "PREVIEW PENDING"}</span>
          </div>
        )}
      </div>
      <div className="img-cap tnum">{filename} · {time}</div>
    </div>
  );
}
