/* ══════════════════════════════════════════════════════════════════════════
   TermContextMenu — the pane's right-click menu (§4.13 parity): copy / paste /
   clear / split right / split down / rename pane / rename tab / close pane.
   A floating plate (§10 recipe) positioned at the pointer and clamped into the
   viewport. Roving-focus keyboard nav mirrors AgentSwitcher (arrows/Home/End,
   Enter activates, Escape/click-away close). Renames happen INLINE in the menu
   (window.prompt is unreliable across webviews) — Enter commits, Escape backs
   out to the item list. Close pane is the one danger-styled item (soft danger:
   tinted surface + danger text on hover, §10).

   Motion: menuMotion (opacity + scale .97→1, --dur-2) — a context menu is
   occasional, not keyboard-high-frequency; reduced-motion keeps the fade via
   the global MotionConfig.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { m } from "motion/react";
import type { Terminal } from "@xterm/xterm";
import { usePanes } from "../store/panes";
import { clipboardRead, clipboardWrite } from "../lib/commands";
import { menuMotion } from "../lib/motion";
import { Icon } from "./icons";

export interface TermContextMenuProps {
  paneId: string;
  term: Terminal;
  x: number;
  y: number;
  onClose: () => void;
}

const MENU_MARGIN = 8;

interface ItemDef {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  run: () => void;
}

export function TermContextMenu({ paneId, term, x, y, onClose }: TermContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [editing, setEditing] = useState<"pane" | "tab" | null>(null);

  const pane = usePanes((s) => s.panes[paneId]);
  const tab = usePanes((s) => s.tabs.find((t) => t.paneIds.includes(paneId)));
  const splitPane = usePanes((s) => s.splitPane);
  const closePane = usePanes((s) => s.closePane);
  const renamePane = usePanes((s) => s.renamePane);
  const renameTab = usePanes((s) => s.renameTab);

  const selection = term.getSelection();

  /* Clamp into the viewport after mount, once the menu's real size is known. */
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - rect.width - MENU_MARGIN));
    const top = Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - rect.height - MENU_MARGIN));
    if (left !== x || top !== y) setPos({ left, top });
  }, [x, y, editing]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (editing) setEditing(null);
        else onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("contextmenu", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("contextmenu", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, editing]);

  /* Autofocus: the rename input in edit mode, else the first enabled item. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (editing) {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        const first = itemRefs.current.find((el) => el && !el.disabled);
        first?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  if (!pane || !tab) return null;

  const commitRename = (value: string) => {
    const title = value.trim();
    if (editing === "tab") {
      renameTab(tab.id, title);
    } else if (editing === "pane" && title) {
      renamePane(paneId, title);
    }
    onClose();
  };

  const items: ItemDef[] = [
    {
      id: "copy",
      label: "Copy",
      disabled: !selection,
      hint: selection ? undefined : "no selection",
      run: () => { void clipboardWrite(selection).catch(() => {}); onClose(); },
    },
    {
      id: "paste",
      label: "Paste",
      run: () => {
        void clipboardRead()
          .then((text) => { if (text) term.paste(text); })
          .catch(() => {});
        onClose();
      },
    },
    { id: "clear", label: "Clear terminal", run: () => { term.clear(); onClose(); } },
    { id: "sep-1", label: "", run: () => {} },
    {
      id: "split-right",
      label: "Split right",
      run: () => { splitPane(tab.id, "vertical", { agent: "shell", cwd: pane.cwd }); onClose(); },
    },
    {
      id: "split-down",
      label: "Split down",
      run: () => { splitPane(tab.id, "horizontal", { agent: "shell", cwd: pane.cwd }); onClose(); },
    },
    { id: "sep-2", label: "", run: () => {} },
    { id: "rename-pane", label: "Rename pane…", run: () => setEditing("pane") },
    { id: "rename-tab", label: "Rename tab…", run: () => setEditing("tab") },
    { id: "sep-3", label: "", run: () => {} },
    { id: "close", label: "Close pane", danger: true, run: () => { closePane(paneId); onClose(); } },
  ];

  const enabledIndexes = () =>
    items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !item.id.startsWith("sep") && !item.disabled)
      .map(({ i }) => i);

  const onItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = enabledIndexes();
    if (enabled.length === 0) return;
    const focusAt = (pos: number) =>
      itemRefs.current[enabled[(pos + enabled.length) % enabled.length]]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAt(enabled.indexOf(index) + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(enabled.indexOf(index) - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[enabled[0]]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[enabled[enabled.length - 1]]?.focus();
    } else if (e.key === "Tab") onClose();
  };

  return (
    <m.div
      ref={menuRef}
      className="term-menu"
      role="menu"
      aria-label="Terminal actions"
      style={{ left: pos.left, top: pos.top }}
      {...menuMotion}
    >
      {editing ? (
        <form
          className="tm-edit"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename(inputRef.current?.value ?? "");
          }}
        >
          <label className="tm-edit-label" htmlFor={`tm-rename-${paneId}`}>
            {editing === "tab" ? "Tab name" : "Pane name"}
          </label>
          <input
            id={`tm-rename-${paneId}`}
            ref={inputRef}
            className="tm-edit-input"
            defaultValue={editing === "tab" ? tab.title : pane.title}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); } }}
          />
          <div className="tm-edit-hint">
            <Icon name="ic-info" size="xs" />
            Enter to save · Esc to cancel
          </div>
        </form>
      ) : (
        items.map((item, index) =>
          item.id.startsWith("sep") ? (
            <div key={item.id} className="tm-sep" role="separator" />
          ) : (
            <button
              key={item.id}
              ref={(node) => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              className={`tm-item${item.danger ? " danger" : ""}`}
              disabled={item.disabled}
              onClick={item.run}
              onKeyDown={(e) => onItemKeyDown(e, index)}
            >
              <span className="tm-item-label">{item.label}</span>
              {item.hint && <span className="tm-hint">{item.hint}</span>}
            </button>
          ),
        )
      )}
    </m.div>
  );
}
