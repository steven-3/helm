/* ══════════════════════════════════════════════════════════════════════════
   OnboardingWizard — Helm's first-run setup (v0.5). A full-screen transient
   overlay (the one sanctioned glass consumer beyond §13.2's list — momentary,
   modal, above the work): brand rail with the six steps on the left, step
   content + nav on the right. Every step is skippable; Esc arms a skip-all
   confirm (second Esc or the confirm button completes it). Finishing any path
   stamps completeOnboarding(ONBOARDING_VERSION) so it never re-shows until the
   version bumps; Settings → Run setup re-opens it via modalSurface.

   Mounted from App.tsx when:
     modalSurface === "onboarding"               (re-run from Settings)
     onboardingCompletedVersion === null         (first run)
     onboardingCompletedVersion < ONBOARDING_VERSION  (upgrade re-offer)
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { overlayMotion, pageMotion, scrimMotion } from "../../lib/motion";
import { useSettings } from "../../store/settings";
import { Icon } from "../icons";
import type { SettingsSection } from "../Settings";
import { WelcomeStep } from "./steps/WelcomeStep";
import { ShellsStep } from "./steps/ShellsStep";
import { IntegrationStep } from "./steps/IntegrationStep";
import { ModelHubStep } from "./steps/ModelHubStep";
import { VoiceStep } from "./steps/VoiceStep";
import { ExtrasStep } from "./steps/ExtrasStep";
import "../../styles/onboarding.css";

/** Bump when a future release adds setup steps worth re-offering on upgrade. */
export const ONBOARDING_VERSION = 1;

interface StepMeta {
  id: string;
  label: string;
}

const STEPS: StepMeta[] = [
  { id: "welcome", label: "Welcome" },
  { id: "shells", label: "Shells" },
  { id: "integration", label: "Command blocks" },
  { id: "models", label: "Model Hub" },
  { id: "voice", label: "Voice" },
  { id: "extras", label: "Extras" },
];

export function OnboardingWizard({
  onOpenSettings,
  onClose,
}: {
  onOpenSettings?: (section: SettingsSection) => void;
  /** Dismisses the overlay. First-run also self-unmounts once
      onboardingCompletedVersion is stamped; the re-run path (Settings → Run
      setup) needs this to clear the App-local open flag. */
  onClose?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const finishedRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    useSettings.getState().completeOnboarding(ONBOARDING_VERSION);
    onClose?.();
  }, [onClose]);

  const openSettings = useCallback(
    (section: SettingsSection) => {
      finish();
      onOpenSettings?.(section);
    },
    [finish, onOpenSettings],
  );

  const isLast = index === STEPS.length - 1;
  const next = useCallback(() => setIndex((i) => Math.min(STEPS.length - 1, i + 1)), []);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Esc = skip-all-confirm: first press arms the footer confirm (auto-disarms),
  // second press (or the confirm button) completes setup and closes. Capture
  // phase so the key never reaches the xterm textarea behind the overlay.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (confirmSkip) finish();
      else setConfirmSkip(true);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [confirmSkip, finish]);

  useEffect(() => {
    if (!confirmSkip) return;
    const timer = window.setTimeout(() => setConfirmSkip(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmSkip]);

  // Focus management: grab focus on mount, move it into the content region on
  // every step change (screen readers announce the labelled region), restore
  // the previously focused element on exit, and trap Tab inside the dialog.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => shellRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !shellRef.current) return;
      const controls = Array.from(
        shellRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((control) => control.offsetParent !== null && control.getAttribute("aria-hidden") !== "true");
      if (controls.length === 0) {
        event.preventDefault();
        shellRef.current.focus({ preventScroll: true });
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!shellRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === shellRef.current)) {
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
  }, []);

  useEffect(() => {
    bodyRef.current?.focus({ preventScroll: true });
  }, [index]);

  const step = STEPS[index];

  const renderStep = () => {
    switch (step.id) {
      case "welcome": return <WelcomeStep />;
      case "shells": return <ShellsStep />;
      case "integration": return <IntegrationStep />;
      case "models": return <ModelHubStep onOpenSettings={openSettings} />;
      case "voice": return <VoiceStep />;
      case "extras": return <ExtrasStep />;
      default: return null;
    }
  };

  return (
    <m.div className="ob-scrim" {...scrimMotion}>
      <m.div
        className="ob-shell glass"
        role="dialog"
        aria-modal="true"
        aria-label="Helm setup"
        tabIndex={-1}
        ref={shellRef}
        {...overlayMotion}
      >
        <aside className="ob-rail">
          <div className="ob-brand">
            <span className="ob-brand-icon" aria-hidden="true">
              <Icon name="ic-helm" />
            </span>
            <div>
              <span className="ob-brand-name">Helm setup</span>
              <span className="ob-brand-sub">v{__APP_VERSION__}</span>
            </div>
          </div>

          <ol className="ob-steps" aria-label="Setup steps">
            {STEPS.map((item, itemIndex) => (
              <li
                key={item.id}
                className={`ob-step-item${itemIndex === index ? " current" : ""}${itemIndex < index ? " done" : ""}`}
                aria-current={itemIndex === index ? "step" : undefined}
              >
                <span className="ob-step-marker" aria-hidden="true">
                  {itemIndex < index ? <Icon name="ic-check" size="xs" /> : itemIndex + 1}
                </span>
                <span className="ob-step-label">{item.label}</span>
              </li>
            ))}
          </ol>

          <p className="ob-rail-foot">Every choice is editable later in Settings.</p>
        </aside>

        <div className="ob-main">
          <div className="ob-progress" aria-hidden="true">
            <span style={{ width: `${(index / (STEPS.length - 1)) * 100}%` }} />
          </div>

          <div
            className="ob-body"
            role="group"
            aria-label={`Step ${index + 1} of ${STEPS.length}: ${step.label}`}
            tabIndex={-1}
            ref={bodyRef}
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.div className="ob-step" key={step.id} {...pageMotion}>
                {renderStep()}
              </m.div>
            </AnimatePresence>
          </div>

          <footer className="ob-foot">
            {confirmSkip ? (
              <div className="ob-skip-confirm" role="alert">
                <span>Skip the rest of setup? Everything is configurable later.</span>
                <div className="ob-foot-nav">
                  <button
                    type="button"
                    className="settings-button ghost"
                    onClick={() => setConfirmSkip(false)}
                  >
                    Keep going
                  </button>
                  <button type="button" className="settings-button primary" onClick={finish}>
                    Skip setup
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="settings-button ghost ob-skip-all"
                  onClick={() => setConfirmSkip(true)}
                >
                  Skip setup
                </button>
                <div className="ob-foot-nav">
                  {index > 0 && (
                    <button type="button" className="settings-button ghost" onClick={back}>
                      Back
                    </button>
                  )}
                  {!isLast && (
                    <button type="button" className="settings-button ghost" onClick={next}>
                      Skip
                    </button>
                  )}
                  <button
                    type="button"
                    className="settings-button primary"
                    onClick={isLast ? finish : next}
                  >
                    {isLast ? "Finish" : "Continue"}
                  </button>
                </div>
              </>
            )}
          </footer>
        </div>
      </m.div>
    </m.div>
  );
}
