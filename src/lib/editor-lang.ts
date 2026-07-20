import { EditorView } from "codemirror";
import { languages } from "@codemirror/language-data";

export async function loadEditorLanguage(path: string) {
  const filename = path.split(/[\\/]/).pop() || path;
  const description = languages.find((language) => {
    if (language.filename?.test(filename)) return true;
    const extension = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "";
    return extension ? language.extensions.includes(extension) : false;
  });
  return description ? description.load() : null;
}

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text-primary)",
    backgroundColor: "var(--surface-sheet)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-sm)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
  },
  ".cm-content": {
    caretColor: "var(--text-primary)",
    padding: "var(--sp-8) 0",
  },
  ".cm-line": {
    padding: "0 var(--sp-12)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-primary)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection-bg) !important",
  },
  ".cm-gutters": {
    color: "var(--terminal-muted)",
    backgroundColor: "var(--surface-panel)",
    borderRight: "1px solid var(--border-subtle)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--surface-hover)",
  },
  ".cm-foldPlaceholder": {
    color: "var(--text-secondary)",
    backgroundColor: "var(--surface-active)",
    border: "1px solid var(--border-default)",
  },
  ".cm-panels": {
    color: "var(--text-primary)",
    backgroundColor: "var(--surface-panel)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border-default)",
  },
  ".cm-panels input": {
    color: "var(--text-primary)",
    backgroundColor: "var(--surface-active)",
    border: "1px solid var(--border-control)",
    borderRadius: "var(--radius-control)",
    fontFamily: "var(--font-mono)",
  },
  ".cm-tooltip": {
    color: "var(--text-primary)",
    backgroundColor: "var(--surface-overlay)",
    border: "1px solid var(--border-panel)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    color: "var(--text-primary)",
    backgroundColor: "var(--surface-active)",
  },
});
