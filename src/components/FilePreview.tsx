/* ══════════════════════════════════════════════════════════════════════════
   FilePreview (Stage widget) — user-surfaced text/file preview (FilesView →
   OscFile). Reads the REAL file via commands.fsReadFile: Rust caps the read at
   its head and reports the real total size + a truncated flag, so a multi-GB
   click can't freeze the thread. Text renders in an embedded EditorPane fed
   the already-loaded head; a truncated head is read-only so a partial buffer
   can never be saved back over the full file. Binary shows mime + real size,
   failures show the real error string. No agent chip — the card-src reads
   "files" (user-surfaced, not an OSC dispatch).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { m } from "motion/react";
import { fsReadFile } from "../lib/commands";
import { cardMotion } from "../lib/motion";
import { EditorPane } from "./EditorPane";
import { Icon } from "./icons";
import type { FileRead, OscFile, StageWidget } from "../lib/contract";

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
  // The frame holds the whole loaded head; "incomplete" = Rust capped the
  // read, which also makes the embedded editor read-only (a partial buffer
  // must never be saved back over the full file).
  const incomplete = file?.truncated ?? false;

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-files" className="icon xs" />File</span>
        <span className="card-src">files</span>
      </div>
      <div className={`file-frame${text !== undefined && load.status === "ready" ? " ed-frame" : ""}`}>
        {load.status === "loading" ? (
          <div className="file-note">reading…</div>
        ) : load.status === "error" ? (
          <div className="file-note">{load.message}</div>
        ) : text !== undefined ? (
          <EditorPane
            embedded
            path={p.path}
            initialContent={text}
            truncated={load.file.truncated}
            readOnly={load.file.truncated}
          />
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
            ? `truncated · showing first ${Math.round(text.length / 1024)} KB of ${Math.round(size / 1024)} KB · read-only`
            : `truncated · head of ${Math.round(size / 1024)} KB`}
        </div>
      )}
      <div className="file-cap tnum">{basename} · {time}</div>
    </m.div>
  );
}
