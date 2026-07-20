/* ══════════════════════════════════════════════════════════════════════════
   CommandPalette — retained as a thin compatibility alias. The ⌘K surface is now
   the **Omnibar** (U1 · §7.1): it ported this component's entire command list
   (contextual actions + the registered catalog) verbatim and added prefix
   routing (> run · @ agent · # file · + task). Kept as a re-export so any
   lingering importer resolves to the single source instead of a divergent copy.
   ══════════════════════════════════════════════════════════════════════════ */
export { Omnibar as CommandPalette } from "./Omnibar";
