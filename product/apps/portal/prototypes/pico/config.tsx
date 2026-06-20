/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Assembles the pico theme's `ThemeWorkshopConfig`: device roster, generator
 * knobs, the screen catalog, the skin class names (so pico's existing CSS drives
 * the chrome), pico's live remap controls, and its navigation sound. This module
 * exports data only — the workshop app (tools/theme-workshop) imports `picoConfig`
 * and mounts it; pico depends on the workshop's *types* alone, never its runtime.
 * Pico's own skin CSS is side-effect-imported here; harness CSS is the app's job.
 */
import type {
  DeviceConfig,
  ThemeKnob,
  ThemeWorkshopConfig,
} from "@tools/theme-workshop"
import { usePicoControls } from "./pico-controls"
import { picoCue } from "./pico-cue"
import { PICO_GROUPS, PICO_SCREENS } from "./screen-catalog"
import { PICO_STORIES } from "./stories"
import "./pico-prototype.css"

// Calibrated seed exported from the device-lab desk. SCALE (px/mm) is
// monitor-specific — recalibrate per monitor via the credit card. Device mm +
// text/pad are the committed design defaults. localStorage (pico:lab) shadows
// this per browser; the calibrator's `reset` falls back to this seed.
const PICO_DEFAULT_PX_PER_MM = 6.78
const PICO_DEVICES: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "thor",
    name: "THOR",
    widthMm: 132,
    heightMm: 76,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
    textPct: 100,
    padPct: 100,
  },
  {
    // 65" 16:9 panel. Far larger than the viewport -> the lab scales it down
    // to fit (display only); its layout resolves as a true 4K 10-foot screen.
    id: "tv65",
    name: '65" 4K TV',
    widthMm: 1439,
    heightMm: 809,
    textPct: 100,
    padPct: 100,
    bezel: false,
  },
]

// Generator knobs (the scale's character). Defaults mirror the CSS fallbacks;
// the lab applies these as custom props on the stage so they cascade in.
const PICO_KNOBS: readonly ThemeKnob[] = [
  {
    id: "base",
    label: "BASE",
    cssVar: "--pico-base-cqi",
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 2.5,
  },
  {
    id: "min",
    label: "MIN",
    cssVar: "--pico-base-min",
    min: 4,
    max: 24,
    step: 1,
    default: 8,
    unit: "px",
  },
  {
    id: "max",
    label: "MAX",
    cssVar: "--pico-base-max",
    min: 12,
    max: 320,
    step: 1,
    default: 200,
    unit: "px",
  },
  {
    id: "ratio",
    label: "RATIO",
    cssVar: "--pico-type-ratio",
    min: 1.1,
    max: 1.6,
    step: 0.01,
    default: 1.25,
  },
  {
    id: "space",
    label: "SPACE",
    cssVar: "--pico-space-unit",
    min: 0.2,
    max: 1.2,
    step: 0.05,
    default: 0.5,
    unit: "em",
  },
]

export const picoConfig: ThemeWorkshopConfig = {
  id: "pico",
  devices: PICO_DEVICES,
  knobs: PICO_KNOBS,
  defaultPxPerMm: PICO_DEFAULT_PX_PER_MM,
  scaleVarPrefix: "pico",
  screens: PICO_SCREENS,
  groups: PICO_GROUPS,
  stories: PICO_STORIES,
  // Pico's existing CSS drives the chrome; the kit emits these exact classes
  // so pico-prototype.css applies unchanged (no neutral wk-* fallback used).
  // Pico skins only the CANVAS — the device-lab frame where its screens render
  // (the `screen` class carries pico's container + token generators, and is also
  // applied to wall cells, so it travels everywhere a pico screen renders). The
  // navigator + montage CHROME (bar / map / wall) is left to the workshop's
  // neutral `wk-*` design, so the workshop looks like the workshop, not pico.
  classNames: {
    stage: "pico-stage",
    screens: "pico-screens",
    bezel: "pico-bezel",
    // `intrinsic` makes @korri/intrinsic-design re-derive the token scale against
    // this screen's own container; pico maps its knobs + aliases its --pico-*
    // tokens onto it (see pico-prototype.css). The recipe is loaded by the host.
    screen: "pico-screen intrinsic",
  },
  // pico's CSS variables + fonts are scoped under [data-pico]; the chrome is
  // fixed-position but stays a DOM descendant of the root, so they resolve.
  rootProps: { "data-pico": true },
  controls: usePicoControls,
  onCue: picoCue,
}
