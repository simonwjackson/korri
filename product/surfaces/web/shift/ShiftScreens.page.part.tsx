/**
 * Shift — screens → parts bridge.
 *
 * The dev-lab "parts" catalog is discovered only from `*.<layer>.part.tsx`
 * files (see tools/theme-workshop/lab/parts-discovery.ts); the single-screen
 * lab is driven separately by `shiftConfig.screens`. Without this file Shift
 * has no parts at all. Mirroring pico's PicoScreens.page.part.tsx, this maps
 * every configured screen into a page-layer story so the same screens (Home,
 * the Library variants, Game Detail) are browsable in the parts view too.
 */
import type { Story } from "@tools/theme-workshop"
import { shiftConfig } from "./config"

export const ShiftPageStories = shiftConfig.screens.map(screen => ({
  id: `shift-page-${screen.id}`,
  layer: "page" as const,
  name: screen.name,
  note: screen.group,
  surface: true,
  render: screen.render,
})) satisfies readonly Story[]
