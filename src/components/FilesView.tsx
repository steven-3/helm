/* ══════════════════════════════════════════════════════════════════════════
   FilesView — file tree over commands.fsReadDir. The root is the explorer's OWN
   navigable location (useExplorer), which DEFAULTS to the active pane's cwd but,
   once the user navigates, becomes an explicit sticky root. This is the fix for
   the tree being frozen at the dir the pane spawned in: the header now carries a
   clickable breadcrumb + up + home + a type-any-path field, and double-clicking a
   folder enters it. No fallback data: no root → note only; read failure → the
   real failure context. Expanding a dir lazy-loads children. Clicking a file
   pushes a user-surfaced Stage preview via useStage.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fsReadDir } from "../lib/commands";
import { usePanes } from "../store/panes";
import { useStage } from "../store/stage";
import { useEnv } from "../store/env";
import { useExplorer, parentOf, buildCrumbs } from "../store/explorer";
import { Icon } from "./icons";
import { FileTypeIcon } from "./file-icons";
import type { OscPayload } from "../lib/contract";

interface FNode { name: string; path: string; dir: boolean }

type Mode = "loading" | "live" | "error";

// Extensions Rust image_read can actually decode. "avif" is intentionally
// EXCLUDED — the image crate needs a non-default feature to decode it, so a
// routed AVIF errors; letting it fall through to the file preview (binary) is
// the honest outcome. "svg" stays: image_read handles it.
const IMG_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff",
]);

export function FilesView() {
  const paneId = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.activePaneId ?? null;
  });
  const paneCwd = usePanes((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return (tab && s.panes[tab.activePaneId]?.cwd) || null;
  });
  const home = useEnv((s) => s.home);
  const override = useExplorer((s) => s.root);
  const setRoot = useExplorer((s) => s.setRoot);

  // The live root: an explicit user location wins; otherwise follow the pane.
  const root = override ?? paneCwd;

  const [mode, setMode] = useState<Mode>("loading");
  const [roots, setRoots] = useState<FNode[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<string, FNode[]>>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const pathErrorId = useId();

  const crumbs = useMemo(() => (root ? buildCrumbs(root) : []), [root]);
  const crumbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root) return;
    let alive = true;
    setMode("loading");
    setRoots([]);
    setChildrenMap({});
    setOpen(new Set());
    (async () => {
      try {
        const entries = await fsReadDir(root);
        if (!alive) return;
        setRoots(entries.map((e) => ({ name: e.name, path: e.path, dir: e.dir })));
        setMode("live");
      } catch {
        if (!alive) return;
        setMode("error");
      }
    })();
    return () => { alive = false; };
  }, [root]);

  // Keep the deepest crumb (current folder) in view when the path overflows.
  useEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [crumbs]);

  const toggle = async (node: FNode) => {
    const next = new Set(open);
    if (next.has(node.path)) {
      next.delete(node.path);
      setOpen(next);
      return;
    }
    next.add(node.path);
    setOpen(next);
    if (!childrenMap[node.path]) {
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

  // User-surfaced preview: push the file onto the focused pane's Stage.
  const preview = (node: FNode) => {
    setSelected(node.path);
    if (!paneId) return;
    const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
    const payload: OscPayload = IMG_EXT.has(ext)
      ? { v: 1, t: "img", path: node.path }
      : { v: 1, t: "file", path: node.path };
    useStage.getState().push({ paneId, payload });
  };

  const goUp = () => {
    if (!root) return;
    const parent = parentOf(root);
    if (parent) setRoot(parent);
  };

  const submitEdit = async () => {
    const target = draft.trim();
    if (!target) {
      setInvalid(true);
      return;
    }
    try {
      await fsReadDir(target); // validate against the real FS before committing
      setRoot(target);
      setEditing(false);
      setInvalid(false);
    } catch {
      setInvalid(true); // keep the field open so the user can correct it
    }
  };

  const upTarget = root ? parentOf(root) : null;

  const renderNodes = (nodes: FNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const isOpen = open.has(node.path);
      const kids = childrenMap[node.path];
      return (
        <div key={node.path}>
          <div
            className={`trow ${node.dir ? "dir" : "file"}${isOpen ? " open" : ""}${selected === node.path ? " selected" : ""}`}
            style={{ paddingLeft: depth * 12 + 6 }}
            tabIndex={0}
            role="treeitem"
            aria-expanded={node.dir ? isOpen : undefined}
            title={node.dir ? "Click to expand · double-click to enter" : node.name}
            onClick={() => (node.dir ? toggle(node) : preview(node))}
            onDoubleClick={() => node.dir && setRoot(node.path)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                node.dir ? toggle(node) : preview(node);
              }
            }}
          >
            <Icon name="ic-caret" className={`tw-chev icon${node.dir ? "" : " leaf"}`}
              style={{ transform: node.dir && isOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
            {node.dir ? (
              <Icon name={isOpen ? "ic-folder-open" : "ic-folder"} className="tw-ico icon" />
            ) : (
              <FileTypeIcon name={node.name} />
            )}
            <span className="tw-name">{node.name}</span>
          </div>
          {node.dir && isOpen && kids && (
            <div className="tree-children">{renderNodes(kids, depth + 1)}</div>
          )}
        </div>
      );
    });

  if (!root) {
    return (
      <>
        <div className="side-head">
          <span className="side-title">Files</span>
        </div>
        <div className="tree-note">no active pane</div>
      </>
    );
  }

  return (
    <>
      <div className="side-head">
        <span className="side-title">Files</span>
        <span className="side-count tnum">{roots.length}</span>
      </div>

      <div className="tree-nav">
        <button className="tree-nav-btn" onClick={goUp} disabled={!upTarget}
          aria-label="Up one folder" title="Up one folder">
          <Icon name="ic-caret" className="icon sm" style={{ transform: "rotate(180deg)" }} />
        </button>
        <button className="tree-nav-btn" onClick={() => home && setRoot(home)} disabled={!home}
          aria-label="Home folder" title="Home folder">
          <Icon name="ic-home" className="icon sm" />
        </button>
        <div className="crumbs" ref={crumbsRef}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span className="crumb-wrap" key={c.path}>
                {i > 0 && <span className="crumb-sep">/</span>}
                {last ? (
                  <span className="crumb cur" title={c.path}>{c.label}</span>
                ) : (
                  <button className="crumb" onClick={() => setRoot(c.path)} title={c.path}>{c.label}</button>
                )}
              </span>
            );
          })}
        </div>
        <button className={`tree-nav-btn${editing ? " on" : ""}`}
          onClick={() => { setDraft(root); setInvalid(false); setEditing((v) => !v); }}
          aria-label="Type a path" title="Go to path…">
          <Icon name="ic-pencil" className="icon sm" />
        </button>
      </div>

      {editing && (
        <>
          <form
            className={`path-edit${invalid ? " invalid" : ""}`}
            onSubmit={(e) => { e.preventDefault(); void submitEdit(); }}
          >
            <input
              autoFocus
              value={draft}
              spellCheck={false}
              placeholder="Go to path, e.g. ~/projects"
              aria-label="Go to path"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? pathErrorId : undefined}
              onChange={(e) => { setDraft(e.target.value); if (invalid) setInvalid(false); }}
              onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); setInvalid(false); } }}
            />
          </form>
          {invalid && (
            <div id={pathErrorId} className="path-error" role="alert">
              Cannot open that folder. Check the path and permissions.
            </div>
          )}
        </>
      )}

      <div className="side-sep" />

      <div className="tree" role="tree" aria-label="Files">
        {mode === "loading" ? (
          <div className="tree-note">reading filesystem…</div>
        ) : mode === "error" ? (
          <div className="tree-note">cannot read {root}</div>
        ) : roots.length === 0 ? (
          <div className="tree-note">empty folder</div>
        ) : (
          renderNodes(roots, 0)
        )}
      </div>
    </>
  );
}
