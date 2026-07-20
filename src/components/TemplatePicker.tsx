import { useEffect, useRef } from "react";
import { GRID_TEMPLATES, usePanes, type GridTemplate } from "../store/panes";
import { Icon } from "./icons";
import "../styles/wiring.css";

export interface TemplatePickerProps { open: boolean; onClose: () => void; tabId?: string }

function Diagram({ template }: { template: GridTemplate }) {
  return <span className="template-diagram" style={{ gridTemplateColumns: `repeat(${template.columns}, 1fr)`, gridTemplateRows: `repeat(${template.rows}, 1fr)` }}>{Array.from({ length: template.count }, (_, index) => <i key={index} />)}</span>;
}

export function TemplatePicker({ open, onClose, tabId }: TemplatePickerProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!open) return null;

  return <div className="wire-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="wire-modal template-picker elev-3" role="dialog" aria-modal="true" aria-labelledby="templates-title" tabIndex={-1} ref={dialogRef}>
      <header className="wire-head"><div><span className="wire-kicker">Workspace topology</span><h2 id="templates-title">Choose a pane template</h2></div><button className="wire-icon-button" type="button" aria-label="Close template picker" onClick={onClose}><Icon name="ic-close" size="sm" /></button></header>
      <p className="template-note">Apply a balanced grid to the active tab. Existing panes are kept first; extra panes are created or removed to fit.</p>
      <div className="template-grid">
        {GRID_TEMPLATES.map((template) => <button type="button" className="template-card elev-1" key={template.count} onClick={() => { usePanes.getState().applyTemplate(template.count, tabId); onClose(); }}>
          <Diagram template={template} />
          <strong>{template.count} {template.count === 1 ? "pane" : "panes"}</strong>
          <span>{template.columns} × {template.rows}</span>
        </button>)}
      </div>
    </section>
  </div>;
}
