/* ══════════════════════════════════════════════════════════════════════════
   AgentSwitcher — the per-pane agent chip (ARCHITECTURE §6). v1 semantics: the
   switcher sets the pane's LAUNCH command; choosing = a REAL new session in the
   same xterm (usePanes.setPaneAgent → respawnPty kills the PTY and spawns the
   new command). Options are launch commands only (claude / codex / $SHELL) —
   model is never guessed; the CLI decides. Menu is an e3 popover (transform-
   origin top-left, scale .97→1 enter/exit via Motion's AnimatePresence, §8
   standard motion — a switcher is occasional, not high-frequency). Closes on
   outside-click and Escape.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "motion/react";
import { usePanes, commandBase } from "../store/panes";
import { useEnv } from "../store/env";
import {
  profileLabel,
  resolveProfileCommand,
  useSettings,
  type TerminalProfile,
} from "../store/settings";
import { respawnPty } from "../lib/terminal-session";
import { menuMotion, pressTap } from "../lib/motion";
import { agentVis } from "./agent-view";
import { Icon } from "./icons";
import type { AgentKind } from "../lib/contract";

interface Option extends Pick<TerminalProfile, "id" | "label" | "agent" | "command" | "launchViaShell"> {}

const glyphColor = (key: "cl" | "cx" | "gn") =>
  key === "cl" ? "var(--agent-claude-text)" : key === "cx" ? "var(--agent-codex-text)" : "var(--text-secondary)";

export function AgentSwitcher({
  paneId,
  agent,
  model,
  command,
  launchViaShell,
}: {
  paneId: string;
  agent: AgentKind;
  model?: string;
  command: string;
  launchViaShell: boolean;
}) {
  const setPaneAgent = usePanes((s) => s.setPaneAgent);
  const state = usePanes((s) => s.panes[paneId]?.state);
  const shell = useEnv((s) => s.shell);
  const profiles = useSettings((s) => s.profiles);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const vis = agentVis(agent, commandBase(command));

  // Launch commands only — the shell option is the user's REAL $SHELL ("bash"
  // is the documented fallback when the env is truly unknown).
  const options: Option[] = profiles
    .filter((profile) => profile.command.trim())
    .map((profile) => ({
      ...profile,
      label: profileLabel(profile),
      command: resolveProfileCommand(profile, shell),
    }));
  const activeProfile = options.find((profile) =>
    profile.agent === agent &&
    profile.command === command &&
    profile.launchViaShell === launchViaShell,
  );
  const activeIndex = Math.max(0, options.findIndex((profile) =>
    profile.agent === agent &&
    profile.command === command &&
    profile.launchViaShell === launchViaShell,
  ));

  const focusOption = (index: number) => {
    if (options.length === 0) return;
    const wrapped = (index + options.length) % options.length;
    const item = itemRefs.current[wrapped];
    item?.focus();
    item?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const openAndFocus = (index = activeIndex) => {
    setOpen(true);
    requestAnimationFrame(() => focusOption(index));
  };

  const closeAndRestore = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeAndRestore();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (o: Option) => {
    // Re-picking the same agent is a no-op ONLY while the session is live;
    // if the pane exited (done/error) the same pick RESTARTS it.
    const sessionIsLive = state === "running" || state === "idle" || state === "needs-input";
    if (
      o.agent === agent &&
      o.command === command &&
      o.launchViaShell === launchViaShell &&
      sessionIsLive
    ) {
      closeAndRestore();
      return;
    }
    setPaneAgent(paneId, o.agent, undefined, o.command, o.launchViaShell, o.label);
    closeAndRestore();
    void respawnPty(paneId); // kill old PTY, spawn the new command into the same xterm
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Home") {
      event.preventDefault();
      openAndFocus(event.key === "Home" ? 0 : activeIndex);
    } else if (event.key === "ArrowUp" || event.key === "End") {
      event.preventDefault();
      openAndFocus(options.length - 1);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closeAndRestore();
    }
  };

  const onOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestore();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="sw-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        className={`switcher ${vis.key}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`session-menu-${paneId}`}
        onClick={() => open ? setOpen(false) : openAndFocus()}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon name={vis.glyph} size="xs" style={{ color: glyphColor(vis.key) }} />
        <span className="sw-agent">{activeProfile?.label ?? vis.word}</span>
        <Icon name="ic-caret" className="sw-caret icon xs" style={{ width: 11, height: 11 }} />
        {model && <span className="sw-model">{model}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <m.div id={`session-menu-${paneId}`} className="sw-menu" role="menu" aria-label="Choose session" {...menuMotion}>
            <div className="sw-menu-label">Session</div>
            {options.map((o, index) => {
              const ov = agentVis(o.agent, commandBase(o.command));
              const on = o.agent === agent && o.command === command && o.launchViaShell === launchViaShell;
              return (
                <m.button
                  key={o.id}
                  ref={(node) => { itemRefs.current[index] = node; }}
                  role="menuitemradio"
                  aria-checked={on}
                  tabIndex={-1}
                  className={`sw-item ${ov.key}${on ? " on" : ""}`}
                  onClick={() => choose(o)}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                  whileTap={pressTap}
                >
                  <Icon name={ov.glyph} size="xs" style={{ color: glyphColor(ov.key) }} />
                  <span className="sw-i-agent">{o.label}</span>
                  <span className="sw-i-model">{commandBase(o.command)}</span>
                </m.button>
              );
            })}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
