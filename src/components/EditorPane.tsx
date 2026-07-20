/* ══════════════════════════════════════════════════════════════════════════
   EditorPane — the CodeMirror 6 editing surface (workstream E, §4.11).

   Two modes over one view lifecycle:
   • Workspace (default): tab strip (EditorTabs) + the active tab's editor,
     conflict/error banners, loading/empty states, and the single 2 s interval
     that polls every open tab for external changes (drvfs: no inotify).
   • Embedded (`embedded` + `initialContent`): the bare surface for FilePreview.
     Seeds the editor store (openFile with seed) so a complete preview is
     editable and Ctrl+S saves, while a truncated seed lands readOnly in the
     store — a destructive partial overwrite is impossible by construction.

   Lifecycle rules: the EditorView is created ONCE per file path (never per
   keystroke); language (lazy, via loadEditorLanguage) and readOnly arrive by
   Compartment reconfiguration; external content (reload / mtime poll) is
   dispatched as a full-doc replace guarded by `applyingExternal` so the store
   update listener can never echo it back into the store.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { editorTheme, loadEditorLanguage } from "../lib/editor-lang";
import { useEditor } from "../store/editor";
import { EditorTabs } from "./EditorTabs";
import { Icon } from "./icons";
import "../styles/editor.css";

/* Syntax colors resolve to semantic tokens at paint time, so the editor
   re-themes with the app (dark/light) for free. Hue budget: indigo keywords,
   teal strings/types, orange literals — the §4.2/§4.3 families; everything
   else stays slate. */
const helmSyntax = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.moduleKeyword], color: "var(--accent-text)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.docString], color: "var(--agent-codex-text)" },
  { tag: [tags.typeName, tags.className, tags.tagName, tags.labelName], color: "var(--agent-codex-text)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit], color: "var(--agent-claude-text)" },
  { tag: [tags.comment, tags.blockComment, tags.lineComment], color: "var(--terminal-muted)", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation, tags.separator], color: "var(--text-secondary)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--text-primary)" },
  { tag: tags.heading, color: "var(--accent-text)", fontWeight: "600" },
  { tag: tags.link, color: "var(--text-link)", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.invalid, color: "var(--status-danger-text)" },
]);

const readOnlyExt = (on: boolean): Extension =>
  on ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [];

export interface EditorPaneProps {
  /** Explicit file to show. Default: the editor store's active tab. */
  path?: string;
  /** Pre-loaded text (embedded previews). Seeds the store; see header. */
  initialContent?: string;
  /** Mark the seed as a partial head — the store tab opens readOnly. */
  truncated?: boolean;
  /** Bare surface without tabs/banners (FilePreview). */
  embedded?: boolean;
  /** Force readOnly regardless of the store tab. */
  readOnly?: boolean;
}

export function EditorPane({ path, initialContent, truncated, embedded, readOnly }: EditorPaneProps) {
  const activeTab = useEditor((s) => s.activeTab);
  const hasTabs = useEditor((s) => s.tabs.length > 0);
  const filePath = path ?? activeTab;
  const tab = useEditor((s) => (filePath ? s.tabs.find((t) => t.path === filePath) : undefined));

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const viewPathRef = useRef<string | null>(null);
  const compartments = useRef({ language: new Compartment(), readOnly: new Compartment() });
  const applyingExternal = useRef(false);

  const effectiveReadOnly = Boolean(readOnly) || Boolean(tab?.readOnly);
  const readOnlyRef = useRef(effectiveReadOnly);
  readOnlyRef.current = effectiveReadOnly;

  // Open-on-mount: an explicit workspace path opens cold; an embedded pane
  // seeds the store with the already-loaded text (or opens cold without one).
  // openFile early-returns for existing tabs, so re-runs are free.
  useEffect(() => {
    if (!filePath) return;
    const store = useEditor.getState();
    if (store.tabs.some((t) => t.path === filePath)) return;
    if (embedded) {
      void store.openFile(filePath, initialContent !== undefined ? { content: initialContent, truncated } : undefined);
    } else if (path) {
      void store.openFile(filePath);
    }
  }, [embedded, filePath, path, initialContent, truncated]);

  // The one external-change poller for every open tab (workspace mode only).
  useEffect(() => {
    if (embedded) return;
    const id = window.setInterval(() => void useEditor.getState().pollExternalChanges(), 2000);
    return () => window.clearInterval(id);
  }, [embedded]);

  const loadFailed = Boolean(tab?.error) && !tab?.content && !tab?.savedContent;
  const showEditor = Boolean(filePath) && !tab?.loading && !loadFailed && (embedded ? true : Boolean(tab));

  // Create/destroy the view strictly on file-path (or surface) transitions.
  // Doc and readOnly changes ride the sync effects below — never a recreate.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !filePath || !showEditor) return;

    const initialDoc = useEditor.getState().tabs.find((t) => t.path === filePath)?.content
      ?? (embedded ? initialContent ?? "" : "");
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          basicSetup, // includes the search keymap (Ctrl+F etc.)
          keymap.of([{
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              const p = viewPathRef.current;
              if (p) void useEditor.getState().save(p);
              return true;
            },
          }]),
          compartments.current.language.of([]),
          compartments.current.readOnly.of(readOnlyExt(readOnlyRef.current)),
          editorTheme,
          syntaxHighlighting(helmSyntax),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || applyingExternal.current) return;
            const p = viewPathRef.current;
            if (p) useEditor.getState().updateContent(p, update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    viewPathRef.current = filePath;

    let alive = true;
    void loadEditorLanguage(filePath)
      .then((language) => {
        if (!alive || !language || viewRef.current !== view) return;
        view.dispatch({ effects: compartments.current.language.reconfigure(language) });
      })
      .catch(() => undefined); // unknown extension → plain text, not a dead editor

    return () => {
      alive = false;
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
      if (viewPathRef.current === filePath) viewPathRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, showEditor, embedded]);

  // External sync: the store's content changed without this view typing it
  // (reload, mtime poll, seed arrival). Replace the doc once, selection maps
  // through the change, and the update listener stays muted for the dispatch.
  const storeContent = tab?.content;
  useEffect(() => {
    const view = viewRef.current;
    if (!view || storeContent === undefined) return;
    if (storeContent === view.state.doc.toString()) return;
    applyingExternal.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: storeContent } });
    applyingExternal.current = false;
  }, [storeContent]);

  // readOnly arrives by reconfiguration (seed flags, truncation flips).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: compartments.current.readOnly.reconfigure(readOnlyExt(effectiveReadOnly)) });
  }, [effectiveReadOnly, showEditor]);

  if (embedded) {
    return (
      <div className="ed-embed">
        <div ref={hostRef} className="ed-cm" />
      </div>
    );
  }

  return (
    <div className="ed-root">
      <EditorTabs />
      {tab?.conflict && filePath && (
        <div className="ed-banner warn" role="alert">
          <Icon name="ic-alert" size="xs" />
          <span className="ed-banner-msg">Changed on disk while you have unsaved edits.</span>
          <button type="button" className="ed-banner-btn" onClick={() => void useEditor.getState().reload(filePath)}>
            Reload
          </button>
          <button type="button" className="ed-banner-btn" onClick={() => useEditor.getState().keepLocal(filePath)}>
            Keep mine
          </button>
        </div>
      )}
      {tab?.error && !loadFailed && (
        <div className="ed-banner danger" role="alert">
          <Icon name="ic-alert" size="xs" />
          <span className="ed-banner-msg">{tab.error}</span>
        </div>
      )}
      <div className="ed-body">
        {!hasTabs || !filePath || !tab ? (
          <div className="ed-empty">
            <Icon name="ic-files" />
            <div className="ed-empty-title">No file open</div>
            <div className="ed-empty-hint">Open a file from the explorer or with quick open.</div>
          </div>
        ) : tab.loading ? (
          <div className="ed-loading" aria-label="Loading file">
            <div className="ed-skel">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : loadFailed ? (
          <div className="ed-error">
            <Icon name="ic-alert" />
            <div className="ed-empty-title">Could not open {tab.name}</div>
            <div className="ed-empty-hint">{tab.error}</div>
          </div>
        ) : (
          <div ref={hostRef} className="ed-cm" />
        )}
      </div>
    </div>
  );
}
