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
 * Home and Game Detail are excluded here because they have dedicated part files
 * (ShiftHome.page.part.tsx / ShiftGameDetail.page.part.tsx) that expose their
 * switchable state families; this bridge covers the single-state Library
 * variants only.
 */
import type { Story } from "@tools/theme-workshop"
import { shiftConfig } from "./config"

// Covered by dedicated stateful part files; keep them out of the bridge so the
// parts tree shows one entry per screen, not two.
const DEDICATED_STATE_PARTS = new Set(["home", "game-detail"])

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
