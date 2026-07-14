/* ══════════════════════════════════════════════════════════════════════════
   WindowResizeGrips — the window is decorations:false, so the OS draws no resize
   border and shows no resize cursor at the edges (helm looked un-resizable even
   where it wasn't). These 8 invisible grips (4 edges + 4 corners) restore both:
   each shows the correct resize cursor on hover and drives Tauri's native
   startResizeDragging on press. No-ops in browser dev (no Tauri).
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback } from "react";

// Mirrors @tauri-apps/api's (non-exported) ResizeDirection union; each literal is
// assignable to startResizeDragging's parameter, so no library type import is needed.
type WinResizeDir =
  | "North" | "South" | "East" | "West"
  | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";

// dir = ResizeDirection string literal (passed straight to Tauri); cls = CSS anchor.
const GRIPS: { dir: WinResizeDir; cls: string }[] = [
  { dir: "North",     cls: "wr-n"  },
  { dir: "South",     cls: "wr-s"  },
  { dir: "West",      cls: "wr-w"  },
  { dir: "East",      cls: "wr-e"  },
  { dir: "NorthWest", cls: "wr-nw" },
  { dir: "NorthEast", cls: "wr-ne" },
  { dir: "SouthWest", cls: "wr-sw" },
  { dir: "SouthEast", cls: "wr-se" },
];

export function WindowResizeGrips() {
  const onGrip = useCallback(
    (direction: WinResizeDir) => async (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return; // primary button only
      event.preventDefault();
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startResizeDragging(direction);
      } catch {
        /* not inside Tauri (browser dev / visual-verify) — ignore */
      }
    },
    [],
  );

  return (
    <div className="win-resize" aria-hidden="true">
      {GRIPS.map((g) => (
        <div key={g.dir} className={`wr-grip ${g.cls}`} onPointerDown={onGrip(g.dir)} />
      ))}
    </div>
  );
}
