/**
 * Shift — screens → parts bridge.
 *
 * The dev-lab "parts" catalog is discovered only from `*.<layer>.part.tsx`
 * files (see tools/theme-workshop/lab/parts-discovery.ts); the single-screen
 * lab is driven separately by `shiftConfig.screens`. Without this file Shift
 * has no parts at all. Mirroring pico's PicoScreens.page.part.tsx, this maps
 * every configured screen into a page-layer story so the same screens are
 * browsable in the parts view too.
 *
 * Every screen with a dedicated part file is excluded here so the parts tree
 * shows one entry per design part, not two. Today that covers all configured
 * screens (Home / Game Detail state families, and the Library variants via
 * ShiftLibrary.page.part.tsx); the bridge remains as the safety net for any
 * future screen added to the config before its dedicated part exists.
 */
import type { Story } from "@simonwjackson/caliper"
import { shiftConfig } from "./config"

// Covered by dedicated stateful part files; keep them out of the bridge so the
// parts tree shows one entry per screen, not two.
const DEDICATED_STATE_PARTS = new Set([
  "home",
  "game-detail",
  "library-grid",
  "library-shelves",
  "library-lens",
  "library-filterbar",
  "library-deck",
  "library-reel",
])

export const ShiftPageStories = shiftConfig.screens
  .filter(screen => !DEDICATED_STATE_PARTS.has(screen.id))
  .map(screen => ({
    id: `shift-page-${screen.id}`,
    layer: "page" as const,
    name: screen.name,
    note: screen.group,
    surface: true,
    render: screen.render,
  })) satisfies readonly Story[]
