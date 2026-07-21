import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { modalMotion, pageMotion, scrimMotion } from "../lib/motion";
import { TERM_FONTS, type TermFontKey } from "../lib/terminal-theme";
import {
  isShellProfile,
  NO_HOST_PROFILE,
  profileLabel,
  useSettings,
  type DensityMode,
  type TerminalRenderer,
} from "../store/settings";
import { useCheatsheet } from "../store/cheatsheet";
import { getShortcutById, formatKeySegments } from "../lib/shortcuts";
import { clipboardWrite } from "../lib/commands";
import { BASH_INTEGRATION_SNIPPET, POWERSHELL_INTEGRATION_SNIPPET } from "../lib/shell-integration";
import { agentVis } from "./agent-view";
import { Icon, type IconName } from "./icons";
import type { AgentKind } from "../lib/contract";
import { ThemeGallery } from "./ThemeGallery";
import { Dropdown } from "./ui/Dropdown";
import { ModelHubPanel } from "./ModelHubPanel";
import { ShellIntegrationRows } from "./ShellIntegrationRows";
import { VoicePanel } from "./VoicePanel";
import { UpdaterCard } from "./UpdaterCard";
import "../styles/settings.css";

export type SettingsSection =
  | "general"
  | "appearance"
  | "terminal"
  | "models"
  | "voice"
  | "updates"
  | "shell"
  | "profiles";

const sections: Array<{ id: SettingsSection; label: string; icon: IconName }> = [
  { id: "general", label: "General", icon: "ic-settings" },
  { id: "appearance", label: "Appearance", icon: "ic-image" },
  { id: "terminal", label: "Terminal", icon: "ic-shell" },
  { id: "models", label: "Models", icon: "ic-braces" },
  { id: "voice", label: "Voice", icon: "ic-broadcast" },
  { id: "updates", label: "Updates", icon: "ic-external" },
  { id: "shell", label: "Shell Integration", icon: "ic-copy" },
  { id: "profiles", label: "Agent profiles", icon: "ic-roster" },
];

const SECTION_IDS = new Set(sections.map((item) => item.id));

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="si-copyline">
      <code>{text}</code>
      <button
        type="button"
        className="si-copy"
        aria-label="Copy line"
        onClick={async () => {
          try {
            await clipboardWrite(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        <Icon name={copied ? "ic-check" : "ic-copy"} size="xs" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Settings({
  onClose,
  initialSection = "appearance",
  onRunSetup,
}: {
  onClose: () => void;
  initialSection?: SettingsSection;
  /** Re-open the first-run setup wizard (owned by App). */
  onRunSetup?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SettingsSection>(
    SECTION_IDS.has(initialSection) ? initialSection : "general",
  );
  useCheatsheet((state) => state.revision);

  const termFont = useSettings((state) => state.termFont);
  const terminalFontSize = useSettings((state) => state.terminalFontSize);
  const terminalLineHeight = useSettings((state) => state.terminalLineHeight);
  const terminalScreenReaderMode = useSettings((state) => state.terminalScreenReaderMode);
  const renderer = useSettings((state) => state.renderer);
  const densityMode = useSettings((state) => state.densityMode);
  const restoreSession = useSettings((state) => state.restoreSession);
  const accentGlow = useSettings((state) => state.accentGlow);
  const stageDetect = useSettings((state) => state.stageDetect);
  const blockHeuristics = useSettings((state) => state.blockHeuristics);
  const profiles = useSettings((state) => state.profiles);
  const defaultProfileId = useSettings((state) => state.defaultProfileId);
  const setTermFont = useSettings((state) => state.setTermFont);
  const setTerminalFontSize = useSettings((state) => state.setTerminalFontSize);
  const setTerminalLineHeight = useSettings((state) => state.setTerminalLineHeight);
  const setTerminalScreenReaderMode = useSettings((state) => state.setTerminalScreenReaderMode);
  const setRenderer = useSettings((state) => state.setRenderer);
  const setDensityMode = useSettings((state) => state.setDensityMode);
  const setRestoreSession = useSettings((state) => state.setRestoreSession);
  const setAccentGlow = useSettings((state) => state.setAccentGlow);
  const setStageDetect = useSettings((state) => state.setStageDetect);
  const setBlockHeuristics = useSettings((state) => state.setBlockHeuristics);
  const setDefaultProfileId = useSettings((state) => state.setDefaultProfileId);
  const setProfileTerminalHost = useSettings((state) => state.setProfileTerminalHost);
  const updateProfile = useSettings((state) => state.updateProfile);
  const addProfile = useSettings((state) => state.addProfile);
  const removeProfile = useSettings((state) => state.removeProfile);
  const resetProfiles = useSettings((state) => state.resetProfiles);
  const resetTerminal = useSettings((state) => state.resetTerminal);

  // "Runs inside" picker (agent-kind rows): hosts are shell-kind profiles only;
  // "" = follow the default terminal profile, NO_HOST_PROFILE = raw spawn.
  const defaultHost = profiles.find(
    (profile) => profile.id === defaultProfileId && isShellProfile(profile),
  );
  const hostOptions = [
    {
      value: "",
      label: "Default terminal",
      description: defaultHost
        ? `Currently ${profileLabel(defaultHost)}`
        : "No shell default set — runs directly",
    },
    {
      value: NO_HOST_PROFILE,
      label: "Directly (legacy)",
      description: "Spawn the command as-is, without a terminal host",
    },
    ...profiles.filter(isShellProfile).map((host) => ({
      value: host.id,
      label: profileLabel(host),
      description: host.command === "shell" ? "System default shell" : host.command,
    })),
  ];

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (useCheatsheet.getState().open) return; // the cheatsheet above owns Escape
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((control) => control.offsetParent !== null && control.getAttribute("aria-hidden") !== "true");
      if (controls.length === 0) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <m.div className="modal-scrim" onMouseDown={onClose} {...scrimMotion}>
      <m.div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        {...modalMotion}
      >
        <aside className="settings-nav">
          <div className="settings-brand">
            <span className="settings-brand-icon"><Icon name="ic-helm" /></span>
            <div>
              <span className="settings-brand-name" id="settings-title">Helm settings</span>
              <span className="settings-brand-sub">Workspace preferences</span>
            </div>
          </div>

          <nav aria-label="Settings sections" className="settings-nav-list">
            {sections.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`settings-nav-item${section === item.id ? " active" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                <Icon name={item.icon} size="sm" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-nav-foot">
            <i className="dot ok" />
            Saved automatically
          </div>
        </aside>

        <div className="settings-main">
          <header className="settings-head">
            <div>
              <span className="settings-kicker">Preferences</span>
              <h2>{sections.find((item) => item.id === section)?.label}</h2>
            </div>
            <button type="button" className="modal-close" aria-label="Close settings" onClick={onClose}>
              <Icon name="ic-close" size="sm" />
            </button>
          </header>

          <div className="settings-scroll">
            <AnimatePresence mode="wait" initial={false}>
              {section === "general" && (
                <m.section className="settings-section" key="general" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Session behavior</h3>
                    <p>How Helm launches, restores, and reads your terminals across long sessions.</p>
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Restore workspace on launch</div>
                      <div className="settings-row-desc">Reopen tabs, pane layout, titles, and working directories with fresh processes. Scrollback is never replayed.</div>
                    </div>
                    <Toggle checked={restoreSession} onChange={setRestoreSession} label="Restore workspace on launch" />
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Surface widgets from terminal output</div>
                      <div className="settings-row-desc">Detect copy / link / command / image cards from any tool and lift them onto the Stage.</div>
                    </div>
                    <Toggle checked={stageDetect} onChange={setStageDetect} label="Surface widgets from terminal output" />
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Keyboard shortcuts</div>
                      <div className="settings-row-desc">Every registered shortcut in one overlay.</div>
                    </div>
                    <button
                      type="button"
                      className="settings-button ghost"
                      onClick={() => useCheatsheet.getState().setOpen(true)}
                    >
                      Open
                      {formatKeySegments(getShortcutById("help.cheatsheet")?.keys ?? "mod+/").map((segment, index) => (
                        <kbd className="kbd" key={index}>{segment}</kbd>
                      ))}
                    </button>
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">First-run setup</div>
                      <div className="settings-row-desc">Re-run the guided setup — shells, command blocks, Model Hub, voice, and theme — any time.</div>
                    </div>
                    <button
                      type="button"
                      className="settings-button"
                      onClick={onRunSetup}
                      disabled={!onRunSetup}
                    >
                      <Icon name="ic-helm" size="sm" />
                      Run setup
                    </button>
                  </div>

                  <div className="settings-note info">
                    <Icon name="ic-info" size="sm" />
                    On WSL, Helm disables only WebKit’s broken DMA-BUF path. It never forces global software rendering.
                  </div>
                </m.section>
              )}

              {section === "appearance" && (
                <m.section className="settings-section" key="appearance" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Theme</h3>
                    <p>Every theme resolves to the same token contract and passes the app’s AA contrast floor. Click to apply — the workspace and every live terminal switch immediately.</p>
                  </div>

                  <ThemeGallery />

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Density</div>
                      <div className="settings-row-desc">Compact tightens control and row heights across lists and chrome. Type size never changes.</div>
                    </div>
                    <div className="seg" role="radiogroup" aria-label="Interface density">
                      {(["cozy", "compact"] as DensityMode[]).map((mode) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={densityMode === mode}
                          key={mode}
                          className={densityMode === mode ? "on" : ""}
                          onClick={() => setDensityMode(mode)}
                        >
                          {mode === "cozy" ? "Cozy" : "Compact"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Titlebar edge light</div>
                      <div className="settings-row-desc">Adds a subtle indigo hairline at the top edge—never a bloom or blur.</div>
                    </div>
                    <Toggle checked={accentGlow} onChange={setAccentGlow} label="Titlebar edge light" />
                  </div>
                </m.section>
              )}

              {section === "terminal" && (
                <m.section className="settings-section" key="terminal" {...pageMotion}>
                  <div className="settings-intro settings-intro-inline">
                    <div>
                      <h3>Terminal typography</h3>
                      <p>Bundled fonts load before xterm measures its grid, preventing metric drift in Claude and Codex.</p>
                    </div>
                    <button type="button" className="settings-button ghost" onClick={resetTerminal}>Reset</button>
                  </div>

                  <div className="font-grid" role="radiogroup" aria-label="Terminal font">
                    {Object.entries(TERM_FONTS).map(([key, spec]) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={termFont === key}
                        key={key}
                        className={`font-option${termFont === key ? " active" : ""}`}
                        onClick={() => setTermFont(key as TermFontKey)}
                      >
                        <span className="font-option-check"><Icon name="ic-check" size="xs" /></span>
                        <span className="font-option-name">{spec.label}</span>
                        <code style={{ fontFamily: spec.stack }}>Aa 01 →_</code>
                      </button>
                    ))}
                  </div>

                  <div className="settings-card terminal-controls">
                    <label className="range-row">
                      <span><strong>Font size</strong><small>Grid text size</small></span>
                      <input
                        type="range"
                        min="13"
                        max="20"
                        step="1"
                        value={terminalFontSize}
                        onChange={(event) => setTerminalFontSize(Number(event.target.value))}
                      />
                      <output>{terminalFontSize}px</output>
                    </label>
                    <label className="range-row">
                      <span><strong>Line height</strong><small>Vertical breathing room</small></span>
                      <input
                        type="range"
                        min="1.15"
                        max="1.6"
                        step="0.05"
                        value={terminalLineHeight}
                        onChange={(event) => setTerminalLineHeight(Number(event.target.value))}
                      />
                      <output>{terminalLineHeight.toFixed(2)}</output>
                    </label>
                  </div>

                  <label className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Renderer</div>
                      <div className="settings-row-desc">WebGL can improve throughput on supported GPUs. Takes effect on new panes.</div>
                    </div>
                    <Dropdown
                      value={renderer}
                      onChange={(value) => setRenderer(value as TerminalRenderer)}
                      ariaLabel="Terminal renderer"
                      options={[
                        { value: "canvas", label: "Canvas" },
                        { value: "webgl", label: "WebGL" },
                      ]}
                    />
                  </label>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Screen reader support</div>
                      <div className="settings-row-desc">Expose terminal output through xterm's accessible DOM layer. Off by default to avoid extra work.</div>
                    </div>
                    <Toggle
                      checked={terminalScreenReaderMode}
                      onChange={setTerminalScreenReaderMode}
                      label="Terminal screen reader support"
                    />
                  </div>

                  <div
                    className="terminal-preview"
                    style={{
                      fontFamily: TERM_FONTS[termFont].stack,
                      fontSize: terminalFontSize,
                      lineHeight: terminalLineHeight,
                    }}
                  >
                    <span className="terminal-preview-muted">~/projects/helm</span>
                    <span><b>❯</b> cx-opus-route</span>
                    <span className="terminal-preview-accent">Ready to coordinate agents.</span>
                  </div>
                </m.section>
              )}

              {section === "models" && (
                <m.section className="settings-section" key="models" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Model Hub</h3>
                    <p>Wire a running CLIProxyAPI, map fleet seats to models, and launch a seat straight into a pane.</p>
                  </div>
                  <ModelHubPanel />
                </m.section>
              )}

              {section === "voice" && (
                <m.section className="settings-section" key="voice" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Voice prompting</h3>
                    <p>Local whisper transcription with an optional LLM improve pass. Everything stays on your machine except the improve call to your proxy.</p>
                  </div>
                  <VoicePanel />
                </m.section>
              )}

              {section === "updates" && (
                <m.section className="settings-section" key="updates" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Updates</h3>
                    <p>Check, download, and install new Helm builds without leaving the app.</p>
                  </div>
                  <UpdaterCard />
                </m.section>
              )}

              {section === "shell" && (
                <m.section className="settings-section" key="shell" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Shell integration</h3>
                    <p>Command blocks are cleanest when your shell emits OSC 133 prompt marks. Source the snippet below from your shell startup file.</p>
                  </div>

                  <div className="settings-card si-osc">
                    <div className="vp-caps">OSC 133 prompt marks</div>
                    <ul className="si-marks">
                      <li><span className="si-mark">A</span> prompt start</li>
                      <li><span className="si-mark">B</span> command input start</li>
                      <li><span className="si-mark">C</span> command output start</li>
                      <li><span className="si-mark">D</span> command end + exit code</li>
                    </ul>
                    <p className="si-desc">Helm reads these to draw precise block boundaries, exit chips, and jump-to-turn — no full block re-chroming, the scrollback stays a terminal.</p>
                  </div>

                  <div className="vp-caps">Install per shell</div>
                  <ShellIntegrationRows variant="settings" />

                  <div className="vp-caps">Or add it by hand</div>
                  <div className="settings-card si-snippets">
                    <div className="si-snippet">
                      <div className="si-snippet-label">bash / zsh <span className="si-file mono">~/.bashrc · ~/.zshrc</span></div>
                      <CopyLine text={`source /path/to/helm/${BASH_INTEGRATION_SNIPPET}`} />
                    </div>
                    <div className="si-snippet">
                      <div className="si-snippet-label">PowerShell <span className="si-file mono">$PROFILE</span></div>
                      <CopyLine text={`. /path/to/helm/${POWERSHELL_INTEGRATION_SNIPPET}`} />
                    </div>
                    <p className="si-desc">Replace <code>/path/to/helm</code> with your Helm install directory. Safe to source more than once.</p>
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Heuristic block detection</div>
                      <div className="settings-row-desc">When the snippet isn’t installed, mark blocks by detecting the prompt with a pattern. Less precise than OSC 133, but zero setup.</div>
                    </div>
                    <Toggle checked={blockHeuristics} onChange={setBlockHeuristics} label="Heuristic block detection" />
                  </div>
                </m.section>
              )}

              {section === "profiles" && (
                <m.section className="settings-section" key="profiles" {...pageMotion}>
                  <div className="settings-intro settings-intro-inline">
                    <div>
                      <h3>Launch profiles</h3>
                      <p>Commands appear in the Agents workspace and each pane’s session switcher.</p>
                    </div>
                    <div className="settings-actions">
                      <button type="button" className="settings-button ghost" onClick={resetProfiles}>Reset</button>
                      <button type="button" className="settings-button" onClick={addProfile}>
                        <Icon name="ic-plus" size="xs" />Add profile
                      </button>
                    </div>
                  </div>

                  <fieldset className="profile-default-group">
                    <legend>Default for new terminals</legend>
                    <label className="profile-default-system">
                      <input
                        type="radio"
                        name="default-terminal-profile"
                        checked={defaultProfileId === null}
                        onChange={() => setDefaultProfileId(null)}
                      />
                      <span>
                        <strong>System shell</strong>
                        <small>Use the operating system default shell.</small>
                      </span>
                    </label>
                  </fieldset>

                  <div className="profile-list">
                    {profiles.map((profile) => {
                      const identity = agentVis(profile.agent, profile.command);
                      return (
                        <article className="profile-editor" key={profile.id}>
                          <div className={`profile-editor-icon ${identity.key}`}>
                            <Icon name={identity.glyph} />
                          </div>
                          <div className="profile-editor-fields">
                            <div className="profile-field-grid">
                              <label>
                                <span>Name</span>
                                <input
                                  value={profile.label}
                                  onChange={(event) => updateProfile(profile.id, { label: event.target.value })}
                                  onBlur={() => {
                                    if (!profile.label.trim()) updateProfile(profile.id, { label: "Untitled profile" });
                                  }}
                                  aria-label={`${profile.label} profile name`}
                                />
                              </label>
                              <label>
                                <span>Identity</span>
                                <Dropdown
                                  value={profile.agent}
                                  onChange={(value) => updateProfile(profile.id, { agent: value as AgentKind })}
                                  ariaLabel={`${profile.label} identity`}
                                  options={[
                                    { value: "claude", label: "Claude" },
                                    { value: "opus", label: "Opus Route" },
                                    { value: "codex", label: "Codex" },
                                    { value: "shell", label: "Shell / other" },
                                  ]}
                                />
                              </label>
                            </div>
                            <label className="profile-command-field">
                              <span>Command</span>
                              <input
                                value={profile.command}
                                placeholder="command --with-args"
                                onChange={(event) => updateProfile(profile.id, { command: event.target.value })}
                                aria-label={`${profile.label} command`}
                              />
                            </label>
                            <label className="profile-description-field">
                              <span>Description</span>
                              <input
                                value={profile.description}
                                onChange={(event) => updateProfile(profile.id, { description: event.target.value })}
                                aria-label={`${profile.label} description`}
                              />
                            </label>
                            {!isShellProfile(profile) && (
                              <label className="profile-host-field">
                                <span>Runs inside</span>
                                <Dropdown
                                  value={profile.terminalProfileId ?? ""}
                                  onChange={(value) => setProfileTerminalHost(profile.id, value || null)}
                                  ariaLabel={`Terminal profile hosting ${profile.label}`}
                                  placeholder="Missing host — runs directly"
                                  options={hostOptions}
                                />
                              </label>
                            )}
                            <div className="profile-editor-foot">
                              <label className="profile-default-choice">
                                <input
                                  type="radio"
                                  name="default-terminal-profile"
                                  checked={defaultProfileId === profile.id}
                                  onChange={() => setDefaultProfileId(profile.id)}
                                />
                                <span>Default for new terminals</span>
                              </label>
                              <div className="profile-shell-copy">
                                <strong>Run through login shell</strong>
                                <small>Loads aliases and functions such as cx-opus-route.</small>
                              </div>
                              <Toggle
                                checked={profile.launchViaShell}
                                onChange={(launchViaShell) => updateProfile(profile.id, { launchViaShell })}
                                label={`Run ${profile.label} through login shell`}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="profile-remove"
                            aria-label={`Remove ${profile.label}`}
                            onClick={() => removeProfile(profile.id)}
                            disabled={profiles.length <= 1}
                          >
                            <Icon name="ic-close" size="xs" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </m.section>
              )}
            </AnimatePresence>
          </div>

          <footer className="settings-footer">
            <span>Helm v{__APP_VERSION__} · Changes apply immediately</span>
            <button type="button" className="settings-button primary" onClick={onClose}>Done</button>
          </footer>
        </div>
      </m.div>
    </m.div>
  );
}
