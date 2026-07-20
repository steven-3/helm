/* ══════════════════════════════════════════════════════════════════════════
   EditorTabs — the editor's open-file strip (§10 tab recipe).

   Square structural segments on the chrome plate, never floating pills: the
   active tab drops to the editor's sheet surface so tab and content meet at a
   shared seam, with the 2px indigo top marker carrying helm's "accent bar =
   selection" language. Dirty state is a neutral dot in the close slot (state,
   not alarm); the close × is always present on the active tab, revealed by
   hover/focus on the rest, and middle-click anywhere on the tab closes it.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEditor } from "../store/editor";
import { FileTypeIcon } from "./file-icons";
import { Icon } from "./icons";

export function EditorTabs() {
  const tabs = useEditor((s) => s.tabs);
  const activeTab = useEditor((s) => s.activeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="ed-tabs" role="tablist" aria-label="Open files">
      {tabs.map((tab) => {
        const active = tab.path === activeTab;
        const cls = `ed-tab${active ? " active" : ""}${tab.dirty ? " dirty" : ""}`;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            className={cls}
            title={tab.readOnly ? `${tab.path} (read-only)` : tab.path}
            onClick={() => useEditor.getState().setActive(tab.path)}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              useEditor.getState().close(tab.path);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              useEditor.getState().setActive(tab.path);
            }}
          >
            <FileTypeIcon name={tab.name} className="ed-tab-ico" />
            <span className="ed-tab-name">{tab.name}</span>
            <button
              type="button"
              className="ed-tab-x"
              aria-label={`Close ${tab.name}`}
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                useEditor.getState().close(tab.path);
              }}
            >
              <Icon name="ic-close" size="xs" className="icon ed-tab-x-ic" />
              {tab.dirty && <span className="ed-tab-dot" aria-hidden="true" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
