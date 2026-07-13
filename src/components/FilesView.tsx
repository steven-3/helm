/* ══════════════════════════════════════════════════════════════════════════
   FilesView — file tree. Attempts commands.fsReadDir on the active cwd; if the
   Rust FS backend isn't live yet (Track A pending) it degrades GRACEFULLY to a
   static project layout so the panel is never empty or crashed. Expanding a dir
   lazy-loads its children (live) or reveals static children (fallback). Clicking a
   file is a Phase-3 preview stub (no-op for now — wires to useStage later).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { fsReadDir } from "../lib/commands";
import { usePanes } from "../store/panes";
import { Icon } from "./icons";

interface FNode { name: string; path: string; dir: boolean; children?: FNode[] }

// Static fallback — a believable helm layout, shown when fs_read_dir isn't wired.
const FALLBACK: FNode[] = [
  {
    name: "src", path: "src", dir: true, children: [
      {
        name: "components", path: "src/components", dir: true, children: [
          { name: "Titlebar.tsx", path: "src/components/Titlebar.tsx", dir: false },
          { name: "Stage.tsx", path: "src/components/Stage.tsx", dir: false },
          { name: "TerminalPane.tsx", path: "src/components/TerminalPane.tsx", dir: false },
        ],
      },
      {
        name: "store", path: "src/store", dir: true, children: [
          { name: "panes.ts", path: "src/store/panes.ts", dir: false },
          { name: "roster.ts", path: "src/store/roster.ts", dir: false },
          { name: "stage.ts", path: "src/store/stage.ts", dir: false },
        ],
      },
      {
        name: "lib", path: "src/lib", dir: true, children: [
          { name: "contract.ts", path: "src/lib/contract.ts", dir: false },
          { name: "commands.ts", path: "src/lib/commands.ts", dir: false },
        ],
      },
      { name: "App.tsx", path: "src/App.tsx", dir: false },
      { name: "main.tsx", path: "src/main.tsx", dir: false },
    ],
  },
  {
    name: "src-tauri", path: "src-tauri", dir: true, children: [
      {
        name: "src", path: "src-tauri/src", dir: true, children: [
          { name: "pty.rs", path: "src-tauri/src/pty.rs", dir: false },
          { name: "main.rs", path: "src-tauri/src/main.rs", dir: false },
        ],
      },
      { name: "Cargo.toml", path: "src-tauri/Cargo.toml", dir: false },
    ],
  },
  {
    name: "mockup", path: "mockup", dir: true, children: [
      { name: "cockpit.html", path: "mockup/cockpit.html", dir: false },
    ],
  },
  { name: "DESIGN.md", path: "DESIGN.md", dir: false },
  { name: "package.json", path: "package.json", dir: false },
  { name: "tsconfig.json", path: "tsconfig.json", dir: false },
];

type Mode = "loading" | "live" | "fallback";

export function FilesView() {
  const cwd = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return (tab && s.panes[tab.activePaneId]?.cwd) || "~/dev/helm";
  });

  const [mode, setMode] = useState<Mode>("loading");
  const [roots, setRoots] = useState<FNode[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<string, FNode[]>>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set(["src"]));
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const entries = await fsReadDir(cwd);
        if (!alive) return;
        setRoots(entries.map((e) => ({ name: e.name, path: e.path, dir: e.dir })));
        setMode("live");
      } catch {
        if (!alive) return;
        // seed the children map from the static tree so expand works offline
        const map: Record<string, FNode[]> = {};
        const seed = (nodes: FNode[]) => {
          for (const n of nodes) if (n.children) { map[n.path] = n.children; seed(n.children); }
        };
        seed(FALLBACK);
        setChildrenMap(map);
        setRoots(FALLBACK);
        setMode("fallback");
      }
    })();
    return () => { alive = false; };
  }, [cwd]);

  const toggle = async (node: FNode) => {
    const next = new Set(open);
    if (next.has(node.path)) {
      next.delete(node.path);
      setOpen(next);
      return;
    }
    next.add(node.path);
    setOpen(next);
    if (mode === "live" && !childrenMap[node.path]) {
      try {
        const entries = await fsReadDir(node.path);
        setChildrenMap((m) => ({
          ...m,
          [node.path]: entries.map((e) => ({ name: e.name, path: e.path, dir: e.dir })),
        }));
      } catch {
        setChildrenMap((m) => ({ ...m, [node.path]: [] }));
      }
    }
  };

  const renderNodes = (nodes: FNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isOpen = open.has(node.path);
      const kids = node.children ?? childrenMap[node.path];
      return (
        <div key={node.path}>
          <div
            className={`trow ${node.dir ? "dir" : "file"}${isOpen ? " open" : ""}${selected === node.path ? " selected" : ""}`}
            style={{ paddingLeft: depth * 12 + 6 }}
            tabIndex={0}
            role="treeitem"
            aria-expanded={node.dir ? isOpen : undefined}
            onClick={() => (node.dir ? toggle(node) : setSelected(node.path))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                node.dir ? toggle(node) : setSelected(node.path);
              }
            }}
          >
            <Icon name="ic-caret" className={`tw-chev icon${node.dir ? "" : " leaf"}`}
              style={{ transform: node.dir && isOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
            <Icon name={node.dir ? "ic-folder" : "ic-files"} className="tw-ico icon" />
            <span className="tw-name">{node.name}</span>
          </div>
          {node.dir && isOpen && kids && renderNodes(kids, depth + 1)}
        </div>
      );
    });

  return (
    <>
      <div className="side-head">
        <span className="side-title">FILES</span>
        <span className="side-count tnum">{roots.length}</span>
      </div>
      <div className="roster-legend" style={{ paddingBottom: "var(--sp-6)" }}>
        <span className="tw-name" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{cwd}</span>
      </div>
      <div className="side-sep" />

      <div className="tree" role="tree" aria-label="Files">
        {mode === "loading" ? (
          <div className="tree-note">reading filesystem…</div>
        ) : (
          renderNodes(roots, 0)
        )}
      </div>

      {mode === "fallback" && (
        <div className="tree-note">project layout · filesystem backend pending</div>
      )}
    </>
  );
}
