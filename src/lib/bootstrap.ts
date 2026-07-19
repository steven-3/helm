/* ══════════════════════════════════════════════════════════════════════════
   App bootstrap — runs once on mount. Resolves the REAL environment from Rust
   (home dir, $SHELL, WSL distro), then creates the first pane: the user's real
   shell in their real home. No hardcoded paths, no demo panes. Also starts the
   git poller (status bar / SCM segments appear only when a real repo answers).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEnv } from "../store/env";
import { useGit } from "../store/git";
import { usePanes } from "../store/panes";
import { restoreWorkspace } from "../store/workspace";
import { initShortcuts } from "./shortcuts";

let booted = false;

export async function bootstrapApp(): Promise<void> {
  if (booted) return;
  booted = true;

  initShortcuts();
  await useEnv.getState().load();
  await restoreWorkspace();

  // addTab pulls command/cwd defaults from useEnv ($SHELL, home) — loaded above.
  if (usePanes.getState().tabs.length === 0) {
    usePanes.getState().addTab({ agent: "shell" });
  }

  useGit.getState().start();
}
