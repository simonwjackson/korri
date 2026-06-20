/**
 * theme-workshop — reusable kit + dev-only viewer app (tools/theme-workshop).
 *
 * The harness is generic: it mounts a theme's screens on the physical-size
 * device lab with a screen navigator, an atomic catalog (screens as pages), and
 * a slot for
 * theme-specific controls. A theme contributes a `ThemeWorkshopConfig` (data +
 * its own skin classes), depending only on this module's *types*; the workshop
 * app (themes.ts + standalone.tsx) imports the config and mounts it:
 *
 *   // in a theme (product side) — types only
 *   import type { ThemeWorkshopConfig } from "@tools/theme-workshop"
 *   export const myThemeConfig: ThemeWorkshopConfig = { ... }
 *
 *   // in the registry (tools/theme-workshop/themes.ts)
 *   import { myThemeConfig } from "@product/.../my-theme/config"
 *
 * Harness CSS lives in `device-lab/device-lab.css` + `workshop.css` (neutral
 * chrome defaults); a theme overrides via its own class names.
 */

export type { ResolvedClassNames } from "./classnames"
export { cx, resolveClassNames } from "./classnames"
export {
  type DeviceConfig,
  DeviceFrame,
  DeviceLab,
  type ThemeKnob,
} from "./device-lab"
export { Gallery } from "./Gallery"
export { Parts } from "./Parts"
export { ThemeWorkshop } from "./ThemeWorkshop"
export type {
  CueKind,
  Screen,
  Story,
  StoryLayer,
  ThemeWorkshopConfig,
  WorkshopClassNames,
  WorkshopControl,
} from "./types"
export {
  getViewMode,
  setViewMode,
  toggleViewMode,
  useViewMode,
  type ViewMode,
} from "./view-store"
export { Wall } from "./Wall"
export { WorkshopControls } from "./WorkshopControls"
