/* ══════════════════════════════════════════════════════════════════════════
   Onboarding shared building blocks — the step header (caps kicker + title +
   description) and the settings switch, so all six wizard steps read as one
   surface. Styles live in styles/onboarding.css; the switch reuses the global
   .switch/.knob recipe from components.css.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ReactNode } from "react";

export function StepHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="ob-step-head">
      <span className="ob-caps">{kicker}</span>
      <h2 className="ob-title">{title}</h2>
      {children ? <p className="ob-desc">{children}</p> : null}
    </header>
  );
}

/** Same role=switch contract as Settings' Toggle — one switch idiom app-wide. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
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
