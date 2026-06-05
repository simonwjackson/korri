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
  DeviceLab,
  type DeviceConfig,
} from "@product/apps/portal/prototypes/pico/device-lab"
import { picoGames } from "@product/apps/portal/prototypes/pico/fixtures"
import {
  type PicoVariantDef,
  PicoPrototypeSwitcher,
} from "@product/apps/portal/prototypes/pico/PicoPrototypeSwitcher"
import { VariantCartridgeShelf } from "@product/apps/portal/prototypes/pico/VariantCartridgeShelf"
import { VariantIconGrid } from "@product/apps/portal/prototypes/pico/VariantIconGrid"
import { VariantMenuList } from "@product/apps/portal/prototypes/pico/VariantMenuList"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import "@product/apps/portal/prototypes/pico/device-lab/device-lab.css"
import "@product/apps/portal/prototypes/pico/pico-prototype.css"

export const Route = createFileRoute("/pico-prototype")({
  component: PicoPrototypeRoute,
})

const VARIANTS: readonly PicoVariantDef[] = [
  { key: "A", name: "Cartridge Shelf" },
  { key: "B", name: "Menu List + Preview" },
  { key: "C", name: "Icon Grid" },
]

const PICO_DEVICES: readonly DeviceConfig[] = [
  // RG353M: 3.5" 4:3 panel.
  {
    id: "handheld",
    name: "HANDHELD",
    widthMm: 71.1,
    heightMm: 53.3,
    textPct: 140,
    padPct: 100,
  },
  // Hypothetical larger 16:9 lean-back panel.
  {
    id: "panel",
    name: "PANEL",
    widthMm: 120,
    heightMm: 67.5,
    textPct: 140,
    padPct: 100,
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
  if (variant === "B") return <VariantMenuList games={picoGames} />
  if (variant === "C") return <VariantIconGrid games={picoGames} />
  return null
}

function readVariant(search: unknown): string {
  const value =
    typeof search === "object" && search !== null && "variant" in search
      ? (search as { readonly variant?: unknown }).variant
      : undefined
  return value === "B" || value === "C" ? value : "A"
}
