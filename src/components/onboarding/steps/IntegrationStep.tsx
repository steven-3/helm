/* ══════════════════════════════════════════════════════════════════════════
   Step 3 · Shell integration (command blocks) — one line in the shell profile
   lets Helm mark every command with ✓/✗ blocks (OSC 133). The rows honor the
   step-2 pick: your default shell leads, everything else collapses under
   "Other shells". Row mechanics (status / preview-before-write / install)
   live in the shared ShellIntegrationRows, reused by Settings → Shell
   Integration.
   ══════════════════════════════════════════════════════════════════════════ */
import { ShellIntegrationRows } from "../../ShellIntegrationRows";
import { StepHeader } from "../shared";

export function IntegrationStep() {
  return (
    <div>
      <StepHeader kicker="Step 3 of 6 · Command blocks" title="Mark every command ✓ / ✗">
        Helm marks each command with ✓/✗ blocks — needs one line in your shell profile.
        You always see the exact change before anything is written.
      </StepHeader>

      <ShellIntegrationRows variant="wizard" />
    </div>
  );
}
