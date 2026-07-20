/* ══════════════════════════════════════════════════════════════════════════
   Step 6 · Extras — three pre-flight toggles wired straight into the settings
   store (screen-reader DOM layer, silent update checks, heuristic command
   blocks), then Finish. Same .settings-card row recipe as Settings so the
   wizard and the app read as one surface.
   ══════════════════════════════════════════════════════════════════════════ */
import { useSettings } from "../../../store/settings";
import { StepHeader, Toggle } from "../shared";

export function ExtrasStep() {
  const screenReader = useSettings((s) => s.terminalScreenReaderMode);
  const setScreenReader = useSettings((s) => s.setTerminalScreenReaderMode);
  const autoCheckUpdates = useSettings((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useSettings((s) => s.setAutoCheckUpdates);
  const blockHeuristics = useSettings((s) => s.blockHeuristics);
  const setBlockHeuristics = useSettings((s) => s.setBlockHeuristics);

  return (
    <div>
      <StepHeader kicker="Step 6 of 6 · Extras" title="Last few switches">
        Sensible defaults are already on — flip anything now, or later in Settings.
      </StepHeader>

      <div className="settings-card settings-row-card">
        <div className="settings-card-copy">
          <div className="settings-row-title">Screen reader support</div>
          <div className="settings-row-desc">
            Expose terminal output through xterm’s accessible DOM layer. Off by default to
            avoid extra work.
          </div>
        </div>
        <Toggle checked={screenReader} onChange={setScreenReader} label="Terminal screen reader support" />
      </div>

      <div className="settings-card settings-row-card">
        <div className="settings-card-copy">
          <div className="settings-row-title">Automatic update checks</div>
          <div className="settings-row-desc">
            Check for new Helm builds on launch and show a pill when one is ready to install.
          </div>
        </div>
        <Toggle checked={autoCheckUpdates} onChange={setAutoCheckUpdates} label="Automatic update checks" />
      </div>

      <div className="settings-card settings-row-card">
        <div className="settings-card-copy">
          <div className="settings-row-title">Heuristic command blocks</div>
          <div className="settings-row-desc">
            When the shell-integration snippet isn’t installed, mark blocks by detecting the
            prompt with a pattern. Less precise than OSC 133, but zero setup.
          </div>
        </div>
        <Toggle checked={blockHeuristics} onChange={setBlockHeuristics} label="Heuristic command blocks" />
      </div>

      <p className="ob-hint obe-outro">
        Every choice here lives in Settings — nothing is locked in. Welcome aboard.
      </p>
    </div>
  );
}
