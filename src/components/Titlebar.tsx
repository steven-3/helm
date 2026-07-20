/* ══════════════════════════════════════════════════════════════════════════
   Titlebar (e1) — brand (helm wheel = the ONE azure moment) + wordmark, centered
   cwd breadcrumb (only when a real pane exists — no fake path fallback), window
   controls wired to Tauri. The window is decorations:false,
   so the bar itself is the drag region (data-tauri-drag-region); the control
   buttons are interactive children and never drag. Close hover = soft-danger (§10).
   ══════════════════════════════════════════════════════════════════════════ */
import { usePanes } from "../store/panes";
import { Icon } from "./icons";

/** Guarded window action — no-ops outside Tauri (browser dev / visual-verify). */
async function winAction(kind: "minimize" | "toggleMaximize" | "close") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (kind === "minimize") await w.minimize();
    else if (kind === "toggleMaximize") await w.toggleMaximize();
    else await w.close();
  } catch {
    /* not running inside Tauri — ignore */
  }
}

export function Titlebar() {
  const cwd = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    const pane = tab ? s.panes[tab.activePaneId] : undefined;
    return pane?.cwd ?? null;
  });

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <Icon name="ic-helm" className="mark icon" />
        <span className="wordmark">helm</span>
      </div>

      <div className="title-cwd" data-tauri-drag-region>
        <span className="crumb">helm</span>
        {cwd && (
          <>
            <span className="sep">·</span>
            <span className="path" title={cwd}>{cwd}</span>
          </>
        )}
      </div>

      <div className="win-ctrls">
        <button className="win-btn" aria-label="Minimize" onClick={() => winAction("minimize")}>
          <Icon name="ic-min" />
        </button>
        <button className="win-btn" aria-label="Maximize" onClick={() => winAction("toggleMaximize")}>
          <Icon name="ic-max" />
        </button>
        <button className="win-btn close" aria-label="Close" onClick={() => winAction("close")}>
          <Icon name="ic-close" />
        </button>
      </div>
    </header>
  );
}
