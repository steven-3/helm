import { useEffect, useMemo, useState, type DragEvent } from "react";
import { fsReadDir, fsReadFile, ptyWrite } from "../lib/commands";
import { fuzzyScore } from "../lib/fuzzy";
import { useEnv } from "../store/env";
import { useExplorer } from "../store/explorer";
import { usePanes } from "../store/panes";
import { Icon } from "./icons";
import "../styles/wiring.css";

export const HELM_SKILL_MIME = "application/x-helm-skill";
export interface SkillsPanelProps { open: boolean; onClose: () => void; root?: string }
interface SkillItem { name: string; path: string; source: "user" | "project" }

const join = (base: string, child: string) => `${base.replace(/[\\/]+$/, "")}/${child}`;
function activeProjectRoot(override?: string): string | null {
  if (override) return override;
  const panes = usePanes.getState();
  const tab = panes.tabs.find((item) => item.id === panes.activeTabId);
  return useExplorer.getState().root ?? (tab ? panes.panes[tab.activePaneId]?.cwd : null) ?? useEnv.getState().cwd;
}

async function scanSkills(dir: string, source: SkillItem["source"]): Promise<SkillItem[]> {
  try {
    const entries = await fsReadDir(dir);
    const checks = await Promise.all(entries.filter((entry) => entry.dir).map(async (entry) => {
      const path = join(entry.path || join(dir, entry.name), "SKILL.md");
      try { await fsReadFile(path); return { name: entry.name, path, source }; } catch { return null; }
    }));
    return checks.filter((item): item is SkillItem => item !== null);
  } catch {
    return [];
  }
}

async function insertSkill(name: string): Promise<void> {
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  if (!tab || !state.panes[tab.activePaneId]) return;
  await ptyWrite(tab.activePaneId, `/${name} `).catch(() => {});
}

export function SkillsPanel({ open, onClose, root }: SkillsPanelProps) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setQuery("");
    const home = useEnv.getState().home;
    const project = activeProjectRoot(root);
    const scans: Promise<SkillItem[]>[] = [];
    if (home) scans.push(scanSkills(join(home, ".claude/skills"), "user"));
    if (project) scans.push(scanSkills(join(project, ".claude/skills"), "project"));
    void Promise.all(scans).then((groups) => {
      if (!live) return;
      const unique = new Map<string, SkillItem>();
      for (const item of groups.flat()) unique.set(`${item.source}:${item.name}`, item);
      setSkills([...unique.values()].sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
    return () => { live = false; };
  }, [open, root]);

  const visible = useMemo(() => skills
    .map((skill) => ({ skill, score: fuzzyScore(query, `${skill.name} ${skill.source}`) }))
    .filter((item): item is { skill: SkillItem; score: number } => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.skill), [skills, query]);

  if (!open) return null;
  const startDrag = (event: DragEvent<HTMLButtonElement>, skill: SkillItem) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(HELM_SKILL_MIME, skill.name);
    event.dataTransfer.setData("text/plain", `/${skill.name} `);
  };

  return <div className="wire-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="wire-modal skills-panel elev-3" role="dialog" aria-modal="true" aria-labelledby="skills-title">
      <header className="wire-head"><div><span className="wire-kicker">Claude skill registry</span><h2 id="skills-title">Skills</h2></div><button className="wire-icon-button" type="button" aria-label="Close skills" onClick={onClose}><Icon name="ic-close" size="sm" /></button></header>
      <div className="wire-toolbar"><label className="wire-search"><Icon name="ic-search" size="sm" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a skill" /></label><span className="wire-hint">Drag a chip onto a terminal pane</span></div>
      <div className="skills-grid">
        {loading && <div className="wire-empty">Scanning skill directories…</div>}
        {!loading && visible.length === 0 && <div className="wire-empty">No skills found in user or project directories.</div>}
        {visible.map((skill) => <article className="skill-card elev-1" key={`${skill.source}:${skill.name}`}>
          <button type="button" draggable className="skill-chip" onDragStart={(event) => startDrag(event, skill)} title="Drag onto a terminal pane"><Icon name="ic-braces" size="xs" />/{skill.name}</button>
          <span>{skill.source === "project" ? "Project" : "User"}</span>
          <button className="wire-button" type="button" onClick={() => void insertSkill(skill.name)}>Insert</button>
        </article>)}
      </div>
    </section>
  </div>;
}
