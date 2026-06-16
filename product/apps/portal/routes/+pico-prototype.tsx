/**
 * PROTOTYPE — pico theme exploration. Throwaway (sub-shape B route).
 *
 * Three structurally-different 8-bit home-screen directions for a future
 * "pico" theme targeting the Anbernic RG353M (640x480). Switch with the
 * floating bar or ?variant=A|B|C. The physical-size calibration desk is the
 * reusable device-lab kit (prototypes/pico/device-lab/); pico is its first
 * consumer. Delete this route + prototypes/pico/ once a direction wins; see
 * prototypes/pico/NOTES.md.
 */
import {
  type DeviceConfig,
  DeviceLab,
  type ThemeKnob,
} from "@product/apps/portal/prototypes/pico/device-lab"
import {
  picoGames,
  picoRecent,
} from "@product/apps/portal/prototypes/pico/fixtures"
import {
  PicoPrototypeSwitcher,
  type PicoVariantDef,
} from "@product/apps/portal/prototypes/pico/PicoPrototypeSwitcher"
import { VariantCartridgeShelf } from "@product/apps/portal/prototypes/pico/VariantCartridgeShelf"
import { VariantGameDetail } from "@product/apps/portal/prototypes/pico/VariantGameDetail"
import { VariantIconGrid } from "@product/apps/portal/prototypes/pico/VariantIconGrid"
import { VariantInGame } from "@product/apps/portal/prototypes/pico/VariantInGame"
import { VariantSettings } from "@product/apps/portal/prototypes/pico/VariantSettings"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import "@product/apps/portal/prototypes/pico/device-lab/device-lab.css"
import "@product/apps/portal/prototypes/pico/pico-prototype.css"

export const Route = createFileRoute("/pico-prototype")({
  component: PicoPrototypeRoute,
})

const VARIANTS: readonly PicoVariantDef[] = [
  { key: "A", name: "Home" },
  { key: "B", name: "Settings" },
  { key: "C", name: "Browse" },
  { key: "D", name: "Game Detail" },
  { key: "E", name: "In-Game" },
]

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
  const variant = readVariant(search)

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
        render={() => renderVariant(variant)}
      />
      <PicoPrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onSelect={key =>
          navigate({ to: "/pico-prototype", search: { variant: key } })
        }
      />
    </div>
  )
}

function renderVariant(variant: string) {
  if (variant === "A") return <VariantCartridgeShelf games={picoGames} />
  if (variant === "B") return <VariantSettings />
  if (variant === "C") return <VariantIconGrid games={picoGames} />
  if (variant === "D") return <VariantGameDetail games={picoGames} />
  if (variant === "E") {
    const hero = picoRecent[0] ?? picoGames[0]
    return hero ? <VariantInGame game={hero} /> : null
  }
  return null
}

function readVariant(search: unknown): string {
  const value =
    typeof search === "object" && search !== null && "variant" in search
      ? (search as { readonly variant?: unknown }).variant
      : undefined
  return value === "B" || value === "C" || value === "D" || value === "E"
    ? value
    : "A"
}
