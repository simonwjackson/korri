/**
 * PROTOTYPE — pico theme exploration. Throwaway (sub-shape B route).
 *
 * The max-out STATE GALLERY for the future "pico" theme: every distinct state
 * (current Korri + plausible future), each reachable from the floating gallery
 * navigator or ?screen=<id>. The physical-size calibration desk is the reusable
 * device-lab kit (prototypes/pico/device-lab/). Delete this route +
 * prototypes/pico/ once a direction wins; see prototypes/pico/NOTES.md.
 */
import {
  type DeviceConfig,
  DeviceLab,
  type ThemeKnob,
} from "@product/apps/portal/prototypes/pico/device-lab"
import { PicoGallery } from "@product/apps/portal/prototypes/pico/PicoGallery"
import {
  findScreen,
  PICO_FIRST_SCREEN,
  PICO_GROUPS,
  PICO_SCREENS,
} from "@product/apps/portal/prototypes/pico/screen-catalog"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import "@product/apps/portal/prototypes/pico/device-lab/device-lab.css"
import "@product/apps/portal/prototypes/pico/pico-prototype.css"

export const Route = createFileRoute("/pico-prototype")({
  component: PicoPrototypeRoute,
})

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

function PicoPrototypeRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const screenId = readScreen(search)
  const screen = findScreen(screenId)

  return (
    <div data-pico>
      <DeviceLab
        storageKey="pico"
        devices={PICO_DEVICES}
        themeKnobs={PICO_KNOBS}
        defaultPxPerMm={PICO_DEFAULT_PX_PER_MM}
        scaleVarPrefix="pico"
        stageClassName="pico-stage"
        screensClassName="pico-screens"
        bezelClassName="pico-bezel"
        screenClassName="pico-screen"
        render={() => screen.render()}
      />
      <PicoGallery
        screens={PICO_SCREENS}
        groups={PICO_GROUPS}
        current={screenId}
        onSelect={id =>
          navigate({ to: "/pico-prototype", search: { screen: id } })
        }
      />
    </div>
  )
}

function readScreen(search: unknown): string {
  const value =
    typeof search === "object" && search !== null && "screen" in search
      ? (search as { readonly screen?: unknown }).screen
      : undefined
  if (typeof value === "string" && PICO_SCREENS.some(s => s.id === value)) {
    return value
  }
  return PICO_FIRST_SCREEN
}
