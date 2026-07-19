import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { modalMotion, pageMotion, scrimMotion } from "../lib/motion";
import { TERM_FONTS, type TermFontKey } from "../lib/terminal-theme";
import type { ThemeMode } from "../lib/theme";
import { useSettings, type DensityMode, type TerminalRenderer } from "../store/settings";
import { useCheatsheet } from "../store/cheatsheet";
import { getShortcutById, formatKeySegments } from "../lib/shortcuts";
import { agentVis } from "./agent-view";
import { Icon, type IconName } from "./icons";
import type { AgentKind } from "../lib/contract";

export type SettingsSection = "appearance" | "terminal" | "profiles" | "performance";

const sections: Array<{ id: SettingsSection; label: string; icon: IconName }> = [
  { id: "appearance", label: "Appearance", icon: "ic-image" },
  { id: "terminal", label: "Terminal", icon: "ic-shell" },
  { id: "profiles", label: "Agent profiles", icon: "ic-roster" },
  { id: "performance", label: "Performance", icon: "ic-settings" },
];

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

export function Settings({
  onClose,
  initialSection = "appearance",
}: {
  onClose: () => void;
  initialSection?: SettingsSection;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SettingsSection>(initialSection);

  const termFont = useSettings((state) => state.termFont);
  const terminalFontSize = useSettings((state) => state.terminalFontSize);
  const terminalLineHeight = useSettings((state) => state.terminalLineHeight);
  const terminalScreenReaderMode = useSettings((state) => state.terminalScreenReaderMode);
  const renderer = useSettings((state) => state.renderer);
  const theme = useSettings((state) => state.theme);
  const densityMode = useSettings((state) => state.densityMode);
  const restoreSession = useSettings((state) => state.restoreSession);
  const accentGlow = useSettings((state) => state.accentGlow);
  const stageDetect = useSettings((state) => state.stageDetect);
  const profiles = useSettings((state) => state.profiles);
  const setTermFont = useSettings((state) => state.setTermFont);
  const setTerminalFontSize = useSettings((state) => state.setTerminalFontSize);
  const setTerminalLineHeight = useSettings((state) => state.setTerminalLineHeight);
  const setTerminalScreenReaderMode = useSettings((state) => state.setTerminalScreenReaderMode);
  const setRenderer = useSettings((state) => state.setRenderer);
  const setTheme = useSettings((state) => state.setTheme);
  const setDensityMode = useSettings((state) => state.setDensityMode);
  const setRestoreSession = useSettings((state) => state.setRestoreSession);
  const setAccentGlow = useSettings((state) => state.setAccentGlow);
  const setStageDetect = useSettings((state) => state.setStageDetect);
  const updateProfile = useSettings((state) => state.updateProfile);
  const addProfile = useSettings((state) => state.addProfile);
  const removeProfile = useSettings((state) => state.removeProfile);
  const resetProfiles = useSettings((state) => state.resetProfiles);
  const resetTerminal = useSettings((state) => state.resetTerminal);

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
              {section === "appearance" && (
                <m.section className="settings-section" key="appearance" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>A calm command center</h3>
                    <p>Matte surfaces, visible depth, and high-contrast slate text—tuned for long sessions.</p>
                  </div>

                  <div className="settings-card appearance-preview">
                    <div className="theme-preview" aria-hidden="true">
                      <span className="theme-preview-nav" />
                      <span className="theme-preview-sheet">
                        <i /><i /><i />
                      </span>
                    </div>
                    <div className="settings-card-copy">
                      <div className="settings-row-title">{theme === "light" ? "Daylit instrument" : "Matte dark"}</div>
                      <div className="settings-row-desc">
                        {theme === "light"
                          ? "Cool paper surfaces with the same restrained indigo signals."
                          : "Near-neutral surfaces with restrained indigo accents."}
                      </div>
                    </div>
                    <span className="settings-badge">Active</span>
                  </div>

                  <label className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Theme</div>
                      <div className="settings-row-desc">Switch the workspace and every live terminal immediately.</div>
                    </div>
                    <select
                      className="settings-select"
                      value={theme}
                      onChange={(event) => setTheme(event.target.value as ThemeMode)}
                      aria-label="Application theme"
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </label>

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

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Restore workspace on launch</div>
                      <div className="settings-row-desc">Reopen tabs, pane layout, titles, and working directories with fresh processes. Scrollback is never replayed.</div>
                    </div>
                    <Toggle
                      checked={restoreSession}
                      onChange={setRestoreSession}
                      label="Restore workspace on launch"
                    />
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

                  <div className="settings-note">
                    <Icon name="ic-check" size="sm" />
                    All readable text meets the app’s high-contrast floor. Dim tones are reserved for decoration.
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
                    <select
                      className="settings-select"
                      value={renderer}
                      onChange={(event) => setRenderer(event.target.value as TerminalRenderer)}
                      aria-label="Terminal renderer"
                    >
                      <option value="canvas">Canvas</option>
                      <option value="webgl">WebGL</option>
                    </select>
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
                                <select
                                  value={profile.agent}
                                  onChange={(event) => updateProfile(profile.id, { agent: event.target.value as AgentKind })}
                                  aria-label={`${profile.label} identity`}
                                >
                                  <option value="claude">Claude</option>
                                  <option value="opus">Opus Route</option>
                                  <option value="codex">Codex</option>
                                  <option value="shell">Shell / other</option>
                                </select>
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
                            <div className="profile-editor-foot">
                              <div>
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

              {section === "performance" && (
                <m.section className="settings-section" key="performance" {...pageMotion}>
                  <div className="settings-intro">
                    <h3>Runtime design</h3>
                    <p>The terminal stays responsive by removing GPU fragility and avoiding unnecessary process work.</p>
                  </div>

                  <div className="settings-card settings-row-card">
                    <div className="settings-card-copy">
                      <div className="settings-row-title">Surface widgets from terminal output</div>
                      <div className="settings-row-desc">Detect copy / link / command / image cards from any tool</div>
                    </div>
                    <Toggle
                      checked={stageDetect}
                      onChange={setStageDetect}
                      label="Surface widgets from terminal output"
                    />
                  </div>

                  <div className="health-list">
                    <div className="health-row">
                      <span className="health-icon"><Icon name="ic-check" size="sm" /></span>
                      <div><strong>Renderer fallback chain</strong><small>WebGL falls back to canvas, then xterm’s DOM renderer when a graphics path is unavailable.</small></div>
                      <span className="settings-badge success">Built in</span>
                    </div>
                    <div className="health-row">
                      <span className="health-icon"><Icon name="ic-check" size="sm" /></span>
                      <div><strong>Persistent terminal layers</strong><small>Tabs retain scrollback and full-screen TUI state without respawning.</small></div>
                      <span className="settings-badge success">Built in</span>
                    </div>
                    <div className="health-row">
                      <span className="health-icon"><Icon name="ic-check" size="sm" /></span>
                      <div><strong>Batched pane resizing</strong><small>Splitter drags preview instantly, then perform one definitive terminal reflow.</small></div>
                      <span className="settings-badge success">Built in</span>
                    </div>
                    <div className="health-row">
                      <span className="health-icon"><Icon name="ic-check" size="sm" /></span>
                      <div><strong>System-aware motion</strong><small>Motion.dev animates lightweight chrome only and honors reduced-motion.</small></div>
                      <span className="settings-badge">Automatic</span>
                    </div>
                  </div>

                  <div className="settings-note info">
                    <Icon name="ic-shell" size="sm" />
                    On WSL, Helm disables only WebKit’s broken DMA-BUF path. It never forces global software rendering.
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
