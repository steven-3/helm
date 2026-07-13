import { useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { respawnPty } from "../lib/terminal-session";
import { pressTap } from "../lib/motion";
import { useLayout } from "../store/layout";
import { usePanes } from "../store/panes";
import { useEnv } from "../store/env";
import { profileLabel, resolveProfileCommand, useSettings } from "../store/settings";
import { agentVis, stateVis } from "./agent-view";
import { Icon } from "./icons";

const prefixedStateClasses = (classes: string) =>
  classes
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => `am-${name}`)
    .join(" ");

export function AgentManager({ onManageProfiles }: { onManageProfiles: () => void }) {
  const profiles = useSettings((state) => state.profiles);
  const panes = usePanes((state) => state.panes);
  const tabs = usePanes((state) => state.tabs);
  const activeTabId = usePanes((state) => state.activeTabId);
  const addTab = usePanes((state) => state.addTab);
  const setActiveTab = usePanes((state) => state.setActiveTab);
  const focusPane = usePanes((state) => state.focusPane);
  const setPaneAgent = usePanes((state) => state.setPaneAgent);
  const closePane = usePanes((state) => state.closePane);
  const setWorkspaceView = useLayout((state) => state.setWorkspaceView);
  const shell = useEnv((state) => state.shell);
  const restartLocks = useRef(new Set<string>());
  const [restarting, setRestarting] = useState<Set<string>>(() => new Set());
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const sessions = useMemo(() => Object.values(panes), [panes]);
  const stateCounts = useMemo(() => {
    let running = 0;
    let idle = 0;
    let needsInput = 0;
    let finished = 0;
    for (const session of sessions) {
      if (session.state === "running") running++;
      else if (session.state === "idle") idle++;
      else if (session.state === "needs-input") needsInput++;
      else if (session.state === "done") finished++;
    }
    return { running, idle, needsInput, finished };
  }, [sessions]);
  const activePaneId = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId)?.activePaneId ?? "",
    [activeTabId, tabs],
  );

  const launchProfile = (profile: (typeof profiles)[number]) => {
    const command = resolveProfileCommand(profile, shell);
    const title = profileLabel(profile);
    if (!command) return;
    addTab({
      agent: profile.agent,
      command,
      title,
      tabTitle: title,
      launchViaShell: profile.launchViaShell,
    });
    setWorkspaceView("terminal");
  };

  const focusSession = (paneId: string, tabId: string) => {
    setActiveTab(tabId);
    focusPane(paneId);
    setWorkspaceView("terminal");
  };

  const restartSession = async (session: (typeof sessions)[number]) => {
    if (restartLocks.current.has(session.id)) return;
    restartLocks.current.add(session.id);
    setRestarting((current) => new Set(current).add(session.id));
    setPaneAgent(
      session.id,
      session.agent,
      session.model,
      session.command,
      session.launchViaShell,
      session.title,
    );
    try {
      await respawnPty(session.id);
    } finally {
      restartLocks.current.delete(session.id);
      setRestarting((current) => {
        const next = new Set(current);
        next.delete(session.id);
        return next;
      });
    }
  };

  const requestClose = (session: (typeof sessions)[number]) => {
    if (
      (session.state === "running" || session.state === "idle" || session.state === "needs-input") &&
      confirmCloseId !== session.id
    ) {
      setConfirmCloseId(session.id);
      return;
    }
    setConfirmCloseId(null);
    closePane(session.id);
  };

  return (
    <section className="agent-page" aria-labelledby="agent-page-title">
      <header className="am-header">
        <div className="am-heading">
          <span className="am-eyebrow">Workspace</span>
          <h1 className="am-title" id="agent-page-title">Agents</h1>
          <p className="am-subtitle">
            Launch a configured agent or manage every session running in this workspace.
          </p>
        </div>

        <div className="am-summary" aria-live="polite" aria-label="Agent session summary">
          <span className="am-summary-item">
            <strong className="am-summary-value">{sessions.length}</strong>
            <span className="am-summary-label">open</span>
          </span>
          <span className="am-summary-divider" aria-hidden="true" />
          <span className="am-summary-item am-summary-running">
            <i className={`am-summary-dot${stateCounts.running > 0 ? " pulse" : ""}`} aria-hidden="true" />
            <strong className="am-summary-value">{stateCounts.running}</strong>
            <span className="am-summary-label">running</span>
          </span>
          <span className="am-summary-divider" aria-hidden="true" />
          <span className="am-summary-item am-summary-idle">
            <i className="am-summary-dot idle" aria-hidden="true" />
            <strong className="am-summary-value">{stateCounts.idle}</strong>
            <span className="am-summary-label">idle</span>
          </span>
          <span className="am-summary-divider" aria-hidden="true" />
          <span className="am-summary-item am-summary-attention">
            <Icon
              name="ic-alert"
              className={`icon am-summary-icon${stateCounts.needsInput > 0 ? " pulse" : ""}`}
              size="xs"
            />
            <strong className="am-summary-value">{stateCounts.needsInput}</strong>
            <span className="am-summary-label">need input</span>
          </span>
          <span className="am-summary-divider" aria-hidden="true" />
          <span className="am-summary-item am-summary-finished">
            <Icon name="ic-check" className="icon am-summary-icon" size="xs" />
            <strong className="am-summary-value">{stateCounts.finished}</strong>
            <span className="am-summary-label">finished</span>
          </span>
        </div>
      </header>

      <section className="am-section" aria-labelledby="am-quick-launch-title">
        <div className="am-section-heading">
          <div>
            <h2 className="am-section-title" id="am-quick-launch-title">Quick launch</h2>
            <p className="am-section-subtitle">Start a fresh terminal from one of your profiles.</p>
          </div>
          <div className="am-section-tools">
            <span className="am-section-count">{profiles.length} profiles</span>
            <button type="button" className="settings-button ghost" onClick={onManageProfiles}>
              Manage profiles
            </button>
          </div>
        </div>

        {profiles.length > 0 ? (
          <div className="am-profile-grid">
            {profiles.map((profile) => {
              const label = profileLabel(profile);
              const resolvedCommand = resolveProfileCommand(profile, shell);
              const identity = agentVis(profile.agent, resolvedCommand);
              return (
                <m.button
                  type="button"
                  className={`am-profile-card am-${identity.key}`}
                  key={profile.id}
                  disabled={!resolvedCommand}
                  onClick={() => launchProfile(profile)}
                  whileTap={pressTap}
                  aria-label={`Launch ${label}`}
                >
                  <span className={`am-profile-icon am-${identity.key}`}>
                    <Icon name={identity.glyph} className="icon am-icon" />
                  </span>
                  <span className="am-profile-copy">
                    <span className="am-profile-label">{label}</span>
                    <span className="am-profile-description">
                      {profile.description ?? `Launch ${identity.word} in a new terminal tab.`}
                    </span>
                    <code className="am-profile-command" title={resolvedCommand}>{resolvedCommand}</code>
                  </span>
                  <span className="am-profile-launch" aria-hidden="true">
                    <Icon name="ic-plus" className="icon am-icon" size="sm" />
                  </span>
                </m.button>
              );
            })}
          </div>
        ) : (
          <div className="am-empty am-empty-profiles">
            <Icon name="ic-plus" className="icon am-empty-icon" />
            <span className="am-empty-title">No launch profiles</span>
            <span className="am-empty-copy">Add a terminal profile in Settings to launch it here.</span>
          </div>
        )}
      </section>

      <section className="am-section am-sessions-section" aria-labelledby="am-sessions-title">
        <div className="am-section-heading">
          <div>
            <h2 className="am-section-title" id="am-sessions-title">Open sessions</h2>
            <p className="am-section-subtitle">Focus, restart, or close terminals without hunting through tabs.</p>
          </div>
          <span className="am-section-count">{sessions.length} sessions</span>
        </div>

        {sessions.length > 0 ? (
          <div className="am-session-list" role="list">
            {sessions.map((session) => {
              const identity = agentVis(session.agent, session.command);
              const status = stateVis(session.state, identity.key);
              const isActive = session.id === activePaneId;
              const isLive = session.state === "running" || session.state === "idle" || session.state === "needs-input";
              const actionLabel = isLive ? "Stop & close" : "Close";

              return (
                <article
                  className={`am-session-row am-${identity.key}${isActive ? " am-active" : ""}`}
                  key={session.id}
                  role="listitem"
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className={`am-session-identity am-${identity.key}`}>
                    <i className={`am-agent-dot am-${identity.key}`} aria-hidden="true" />
                    <span className="am-session-icon">
                      <Icon name={identity.glyph} className="icon am-icon" size="sm" />
                    </span>
                  </span>

                  <div className="am-session-main">
                    <div className="am-session-title-row">
                      <span className="am-session-title">{session.title}</span>
                      {session.model && <span className="am-session-model">{session.model}</span>}
                      {isActive && <span className="am-current-chip">current</span>}
                    </div>
                    <div className="am-session-meta">
                      <span className="am-session-agent">{identity.word}</span>
                      <span className="am-meta-separator" aria-hidden="true">·</span>
                      <code className="am-session-command" title={session.command}>{session.command}</code>
                      <span className="am-meta-separator" aria-hidden="true">·</span>
                      <span className="am-session-cwd" title={session.cwd}>{session.cwd}</span>
                    </div>
                  </div>

                  <span
                    className={`am-session-state ${prefixedStateClasses(status.cls)}`}
                    data-state={session.state}
                  >
                    {status.kind === "dot" ? (
                      <i
                        className={`am-state-dot am-${status.dot}`}
                        aria-hidden="true"
                      />
                    ) : (
                      <Icon
                        name={status.icon!}
                        className={`icon am-state-icon${status.pulse ? " pulse" : ""}`}
                        size="xs"
                      />
                    )}
                    <span className="am-state-word">{status.word}</span>
                  </span>

                  <div className="am-session-actions" aria-label={`Actions for ${session.title}`}>
                    <m.button
                      type="button"
                      className="am-action am-action-focus"
                      onClick={() => focusSession(session.id, session.tabId)}
                      whileTap={pressTap}
                      aria-label={`Focus ${session.title}`}
                    >
                      <Icon name="ic-external" className="icon am-action-icon" size="xs" />
                      Focus
                    </m.button>
                    <m.button
                      type="button"
                      className="am-action am-action-restart"
                      onClick={() => void restartSession(session)}
                      disabled={restarting.has(session.id)}
                      whileTap={pressTap}
                      aria-label={`Restart ${session.title}`}
                    >
                      {restarting.has(session.id) ? "Restarting…" : "Restart"}
                    </m.button>
                    <m.button
                      type="button"
                      className="am-action am-action-close"
                      onClick={() => requestClose(session)}
                      onBlur={() => {
                        if (confirmCloseId === session.id) setConfirmCloseId(null);
                      }}
                      whileTap={pressTap}
                      aria-label={`${actionLabel} ${session.title}`}
                    >
                      <Icon name="ic-close" className="icon am-action-icon" size="xs" />
                      {confirmCloseId === session.id ? "Confirm stop" : actionLabel}
                    </m.button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="am-empty am-empty-sessions">
            <Icon name="ic-roster" className="icon am-empty-icon" />
            <span className="am-empty-title">No active sessions</span>
            <span className="am-empty-copy">Choose a profile above to start your first agent.</span>
          </div>
        )}
      </section>
    </section>
  );
}
