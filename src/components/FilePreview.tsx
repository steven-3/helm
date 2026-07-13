/* ══════════════════════════════════════════════════════════════════════════
   FilePreview (Stage widget) — user-surfaced text/file preview (FilesView →
   OscFile). Reads the REAL file via commands.fsReadFile: Rust caps the read at
   its head and reports the real total size + a truncated flag, so a multi-GB
   click can't freeze the thread. Text renders in a capped <pre> (first 64 KB,
   with an honest truncation note keyed on the REAL size), binary shows mime +
   real size, failures show the real error string. No agent chip — the card-src
   reads "files" (user-surfaced, not an OSC dispatch).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { m } from "motion/react";
import { fsReadFile } from "../lib/commands";
import { cardMotion } from "../lib/motion";
import { Icon } from "./icons";
import type { FileRead, OscFile, StageWidget } from "../lib/contract";

const TEXT_CAP = 64 * 1024; // chars shown in the frame

type Load =
  | { status: "loading" }
  | { status: "ready"; file: FileRead }
  | { status: "error"; message: string };

export function FilePreview({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscFile;
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setLoad({ status: "loading" });
    (async () => {
      try {
        const file = await fsReadFile(p.path);
        if (alive) setLoad({ status: "ready", file });
      } catch (err) {
        if (alive) setLoad({ status: "error", message: String(err) });
      }
    })();
    return () => { alive = false; };
  }, [p.path]);

  const basename = p.path.split(/[\\/]/).pop() || p.path;
  const d = new Date(widget.ts);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const file = load.status === "ready" ? load.file : undefined;
  const text = file?.text;
  // REAL total size on disk (bytes) — Rust reports it independent of the read
  // cap. Never derive size from b64.length: the payload is now a capped head.
  const size = file?.size ?? 0;
  // The display <pre> shows at most TEXT_CAP chars of the head.
  const displayCapped = text !== undefined && text.length > TEXT_CAP;
  // The frame isn't the whole file if Rust capped the read OR our slice caps.
  const incomplete = (file?.truncated ?? false) || displayCapped;

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-files" className="icon xs" />File</span>
        <span className="card-src">files</span>
      </div>
      <div className="file-frame">
        {load.status === "loading" ? (
          <div className="file-note">reading…</div>
        ) : load.status === "error" ? (
          <div className="file-note">{load.message}</div>
        ) : text !== undefined ? (
          <pre className="file-text">{displayCapped ? text.slice(0, TEXT_CAP) : text}</pre>
        ) : load.file.b64 ? (
          <div className="file-note">
            binary · {load.file.mime} · {Math.round(size / 1024)} KB
          </div>
        ) : (
          <div className="file-note">{load.file.mime}</div>
        )}
      </div>
      {incomplete && file && (
        <div className="file-note">
          {text !== undefined
            ? `truncated · showing first ${Math.round(Math.min(text.length, TEXT_CAP) / 1024)} KB of ${Math.round(size / 1024)} KB`
            : `truncated · head of ${Math.round(size / 1024)} KB`}
        </div>
      )}
      <div className="file-cap tnum">{basename} · {time}</div>
    </m.div>
  );
}
