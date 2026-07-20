/* ══════════════════════════════════════════════════════════════════════════
   PreviewPane — the embedded localhost browser (OVERHAUL-V4 §4.12). A URL bar
   over an iframe, filling whatever surface (center or right-dock) the shell
   mounts it into. Allowlist: http://localhost:* and http://127.0.0.1:* ONLY —
   anything else never reaches the iframe; it gets the quiet blocked plate with
   an open-external out (Tauri opener plugin, the LinkCard pattern). Controls:
   back/forward via iframe history (best-effort: cross-origin frames expose
   history traversal but not history state, so position is tracked optimistically
   from load events), refresh, open-external, and a device-width toggle
   (full / 375px mobile, centered with hairline edges).

   Roles (§7): the toolbar is Embedded chrome (panel plate, one seam, the
   groove top edge); the page stage is a recessed content well (surface-base);
   the URL field is Editable; the loading bar is the accent's one spend
   (info/state, §4.5). Blocked + empty states are designed plates, never
   window.alert. Motion: dur-fast color fades + a linear progress slide
   (state indication; reduced-motion keeps a static bar). Instant on every
   keyboard action — no Motion library here.

   NOTE (icons): back/forward reuse the sprite's ic-chev (flipped for back);
   the refresh glyph is a local inline SVG in the sprite's stroke idiom because
   icons.tsx sits outside this workstream's ownership. Migrate to the sprite
   when a refresh symbol lands there.
   ══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState } from "react";
import { openerOpen } from "../lib/commands";
import { Icon } from "./icons";
import "../styles/preview.css";

export interface PreviewPaneProps {
  /** Optional starting URL; normalized against the localhost allowlist. */
  initialUrl?: string;
}

type PreviewWidth = "full" | "mobile";

/** localhost allowlist (§4.12): http only, hostname localhost | 127.0.0.1, any
    port. Accepts the shorthand a developer actually types: "3000", ":3000",
    "localhost:3000/api" — and rejects everything else (null). */
function normalizeLocalUrl(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;
  if (/^:\d{1,5}$/.test(t)) t = `localhost${t}`;
  else if (/^\d{1,5}$/.test(t)) t = `localhost:${t}`;
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:") return null;
    if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Best-effort absolute URL for the open-external out on a blocked entry. */
function toExternalUrl(raw: string): string {
  const s = raw.trim();
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

/** Refresh glyph in the sprite idiom (see header note). */
function IcRefresh() {
  return (
    <svg className="icon sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.8v3.6h-3.6" />
    </svg>
  );
}

export function PreviewPane({ initialUrl }: PreviewPaneProps) {
  const first = initialUrl ? normalizeLocalUrl(initialUrl) : null;
  const [input, setInput] = useState(initialUrl ?? "");
  const [current, setCurrent] = useState<string | null>(first);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(first));
  const [width, setWidth] = useState<PreviewWidth>("full");
  /* Best-effort joint-history bookkeeping: pos is 1-based. Every load event we
     did not initiate (in-frame link click) pushes; back/forward traverse. */
  const [hist, setHist] = useState({ pos: first ? 1 : 0, len: first ? 1 : 0 });
  const silentLoadRef = useRef(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const submit = () => {
    const url = normalizeLocalUrl(input);
    if (!url) {
      if (input.trim()) setBlocked(input.trim());
      return;
    }
    setBlocked(null);
    silentLoadRef.current = true;
    setLoading(true);
    setHist((h) => ({ pos: h.pos + 1, len: h.pos + 1 }));
    if (url === current && frameRef.current) {
      frameRef.current.src = url; // re-assigning src forces a real reload
    }
    setCurrent(url);
  };

  const onFrameLoad = () => {
    setLoading(false);
    if (silentLoadRef.current) {
      silentLoadRef.current = false;
      return;
    }
    setHist((h) => ({ pos: h.pos + 1, len: h.pos + 1 })); // in-frame navigation
  };

  const goBack = () => {
    const f = frameRef.current;
    if (!f || hist.pos <= 1) return;
    try {
      silentLoadRef.current = true;
      f.contentWindow?.history.back();
      setHist((h) => ({ ...h, pos: h.pos - 1 }));
    } catch {
      silentLoadRef.current = false; // cross-origin guard: leave history as-is
    }
  };

  const goForward = () => {
    const f = frameRef.current;
    if (!f || hist.pos >= hist.len) return;
    try {
      silentLoadRef.current = true;
      f.contentWindow?.history.forward();
      setHist((h) => ({ ...h, pos: h.pos + 1 }));
    } catch {
      silentLoadRef.current = false;
    }
  };

  const refresh = () => {
    const f = frameRef.current;
    if (!f || !current) return;
    silentLoadRef.current = true;
    setLoading(true);
    try {
      f.contentWindow?.location.reload();
    } catch {
      f.src = current; // cross-origin guard: reload the entry URL instead
    }
  };

  const inputUrl = normalizeLocalUrl(input);
  const externalTarget = current ?? inputUrl;
  const openExternal = (url: string) => void openerOpen(url).catch(() => {});

  return (
    <div className="pv-root">
      <div className="pv-bar" role="toolbar" aria-label="Preview controls">
        <button
          type="button"
          className="pv-btn-nav"
          aria-label="Back"
          title="Back"
          disabled={hist.pos <= 1}
          onClick={goBack}
        >
          <Icon name="ic-chev" size="sm" className="icon sm pv-flip" />
        </button>
        <button
          type="button"
          className="pv-btn-nav"
          aria-label="Forward"
          title="Forward"
          disabled={hist.pos >= hist.len}
          onClick={goForward}
        >
          <Icon name="ic-chev" size="sm" />
        </button>
        <button
          type="button"
          className="pv-btn-nav"
          aria-label="Reload"
          title="Reload"
          disabled={!current}
          onClick={refresh}
        >
          <IcRefresh />
        </button>

        <form
          className="pv-url"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setInput(current ?? "");
            }}
            placeholder="localhost:3000"
            aria-label="Preview URL"
            spellCheck={false}
            autoComplete="off"
          />
        </form>

        <div className="pv-seg" role="group" aria-label="Preview width">
          <button
            type="button"
            className={width === "full" ? "on" : ""}
            aria-pressed={width === "full"}
            onClick={() => setWidth("full")}
          >
            Full
          </button>
          <button
            type="button"
            className={width === "mobile" ? "on" : ""}
            aria-pressed={width === "mobile"}
            onClick={() => setWidth("mobile")}
          >
            <span className="pv-mono">375</span>
          </button>
        </div>

        <button
          type="button"
          className="pv-btn-nav"
          aria-label="Open in browser"
          title="Open in browser"
          disabled={!externalTarget}
          onClick={() => externalTarget && openExternal(externalTarget)}
        >
          <Icon name="ic-external" size="sm" />
        </button>
      </div>

      <div className="pv-stage">
        <div className={`pv-load${loading && current ? " on" : ""}`} aria-hidden="true">
          <i />
        </div>

        {blocked ? (
          <div className="pv-plate">
            <Icon name="ic-info" />
            <div className="pv-plate-title">Localhost preview only</div>
            <div className="pv-plate-hint">
              <span className="pv-mono">{blocked}</span> is not a localhost http address, so it
              cannot load in here. Open it in your browser instead.
            </div>
            <div className="pv-plate-actions">
              <button type="button" className="pv-btn" onClick={() => openExternal(toExternalUrl(blocked))}>
                Open external
                <Icon name="ic-external" size="xs" />
              </button>
              {current && (
                <button
                  type="button"
                  className="pv-btn-quiet"
                  onClick={() => {
                    setBlocked(null);
                    setInput(current);
                  }}
                >
                  Back to <span className="pv-mono">{new URL(current).host}</span>
                </button>
              )}
            </div>
          </div>
        ) : current ? (
          <iframe
            ref={frameRef}
            className={`pv-frame${width === "mobile" ? " mobile" : ""}`}
            src={current}
            title="Localhost preview"
            onLoad={onFrameLoad}
          />
        ) : (
          <div className="pv-plate">
            <Icon name="ic-external" />
            <div className="pv-plate-title">Preview a local dev server</div>
            <div className="pv-plate-hint">
              Enter a localhost URL above, e.g. <span className="pv-mono">localhost:3000</span>.
              Only http://localhost and http://127.0.0.1 addresses load here; anything else opens
              in your browser.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
