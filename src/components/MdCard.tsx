/* ══════════════════════════════════════════════════════════════════════════
   MdCard (Stage widget) — an OscMarkdown rendered by a MINIMAL, SAFE renderer.

   SECURITY (load-bearing — the whole reason arbitrary agent markdown is safe):
   • NO markdown dependency, and NO raw HTML is ever produced. Every piece of the
     source becomes a React TEXT node or a known element with text children, so
     React escapes it — a value like `<img onerror=…>` renders as literal text,
     never markup. There is no dangerouslySetInnerHTML anywhere.
   • Supported blocks: #/##/### headings, - / * / + bullet lists, 1. numbered
     lists, ``` fenced code, paragraphs. Inline: `code`, **bold**, *italic*,
     [label](url). Anything else is plain text.
   • Links: ONLY http(s) — the scheme is re-checked at click time and opened via
     the OS opener (commands.openerOpen), never in-webview. A non-http link
     degrades to its plain label text. Rendered as an anchor with
     target="_blank" rel="noopener noreferrer" (mirrors LinkCard).
   ══════════════════════════════════════════════════════════════════════════ */
import type { ReactNode } from "react";
import { m } from "motion/react";
import { openerOpen } from "../lib/commands";
import { cardMotion } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { OscMarkdown, StageWidget } from "../lib/contract";

const SAFE_LINK_SCHEME_RE = /^https?:\/\//i;

type Block =
  | { kind: "code"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) { blocks.push({ kind: "p", text: para.join(" ") }); para = []; }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {                       // fenced code — verbatim
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;                                            // consume closing fence (or EOF)
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);         // # / ## / ### heading
    if (h) { flush(); blocks.push({ kind: "h", level: h[1].length, text: h[2].trim() }); i++; continue; }

    if (/^\s*[-*+]\s+/.test(line)) {                  // - / * / + bullet list
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {                  // 1. numbered list
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    if (/^\s*$/.test(line)) { flush(); i++; continue; } // blank → paragraph break

    para.push(line.trim());                            // paragraph line (soft-wrapped)
    i++;
  }
  flush();
  return blocks;
}

function MdLink({ label, url }: { label: string; url: string }) {
  if (!SAFE_LINK_SCHEME_RE.test(url)) return <>{label}</>; // non-http → plain text
  return (
    <a
      className="md-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        if (SAFE_LINK_SCHEME_RE.test(url)) void openerOpen(url); // re-checked at click
      }}
    >
      <span className="md-link-txt">{label}</span>
      <Icon name="ic-external" className="icon xs" />
    </a>
  );
}

/* Inline: `code` | [label](url) | **bold** | *italic*. A fresh regex per call so
   the recursion (bold/italic bodies) never clobbers a parent's lastIndex. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const re = /(`+)([^`]+?)\1|\[([^\]]+)\]\(([^)\s]+)\)|(\*\*|__)([\s\S]+?)\5|(\*|_)([\s\S]+?)\7/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[1] !== undefined) {
      nodes.push(<code key={key} className="md-code">{m[2]}</code>);
    } else if (m[3] !== undefined) {
      nodes.push(<MdLink key={key} label={m[3]} url={m[4]} />);
    } else if (m[5] !== undefined) {
      nodes.push(<strong key={key}>{renderInline(m[6], key)}</strong>);
    } else {
      nodes.push(<em key={key}>{renderInline(m[8], key)}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MdCard({ widget }: { widget: StageWidget }) {
  const p = widget.payload as OscMarkdown;
  const src = widget.agent ? agentVis(widget.agent) : null; // null = user-surfaced
  const blocks = parseBlocks(p.md);

  return (
    <m.div className="card" {...cardMotion}>
      <div className="card-head">
        <span className="card-kind"><Icon name="ic-markdown" className="icon xs" />Markdown</span>
        {src ? (
          <span className="card-src"><i className={`dot ${src.key}`} />{src.word}</span>
        ) : (
          <span className="card-src">files</span>
        )}
      </div>

      <div className="md-body">
        {blocks.length === 0 ? (
          <p className="md-p md-empty">empty document</p>
        ) : (
          blocks.map((b, i) => {
            if (b.kind === "code") {
              return <pre key={i} className="md-pre" tabIndex={0}><code>{b.text}</code></pre>;
            }
            if (b.kind === "h") {
              return (
                <div key={i} className={`md-h${b.level}`} role="heading" aria-level={b.level + 2}>
                  {renderInline(b.text, `h${i}`)}
                </div>
              );
            }
            if (b.kind === "ul") {
              return (
                <ul key={i} className="md-ul">
                  {b.items.map((it, j) => <li key={j}>{renderInline(it, `u${i}-${j}`)}</li>)}
                </ul>
              );
            }
            if (b.kind === "ol") {
              return (
                <ol key={i} className="md-ol">
                  {b.items.map((it, j) => <li key={j}>{renderInline(it, `o${i}-${j}`)}</li>)}
                </ol>
              );
            }
            return <p key={i} className="md-p">{renderInline(b.text, `p${i}`)}</p>;
          })
        )}
      </div>

      {p.label && <div className="card-hint">{p.label}</div>}
    </m.div>
  );
}
