/**
 * PROTOTYPE — pico theme exploration. Throwaway (sub-shape B route).
 *
 * Three structurally-different 8-bit home-screen directions for a future
 * "pico" theme targeting the Anbernic RG353M (640x480). Switch with the
 * floating bar or ?variant=A|B|C. Delete this route + prototypes/pico/
 * once a direction wins; see prototypes/pico/NOTES.md.
 */
import { picoGames } from "@product/apps/portal/prototypes/pico/fixtures"
import {
  type PicoVariantDef,
  PicoPrototypeSwitcher,
} from "@product/apps/portal/prototypes/pico/PicoPrototypeSwitcher"
import { VariantCartridgeShelf } from "@product/apps/portal/prototypes/pico/VariantCartridgeShelf"
import { VariantIconGrid } from "@product/apps/portal/prototypes/pico/VariantIconGrid"
import { VariantMenuList } from "@product/apps/portal/prototypes/pico/VariantMenuList"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import "@product/apps/portal/prototypes/pico/pico-prototype.css"

export const Route = createFileRoute("/pico-prototype")({
  component: PicoPrototypeRoute,
})

const VARIANTS: readonly PicoVariantDef[] = [
  { key: "A", name: "Cartridge Shelf" },
  { key: "B", name: "Menu List + Preview" },
  { key: "C", name: "Icon Grid" },
]

function PicoPrototypeRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const variant = readVariant(search)

  return (
    <div className="pico-stage" data-pico>
      <div className="pico-bezel">
        <div className="pico-screen">
          {variant === "A" ? <VariantCartridgeShelf games={picoGames} /> : null}
          {variant === "B" ? <VariantMenuList games={picoGames} /> : null}
          {variant === "C" ? <VariantIconGrid games={picoGames} /> : null}
        </div>
      </div>
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

function readVariant(search: unknown): string {
  const value =
    typeof search === "object" && search !== null && "variant" in search
      ? (search as { readonly variant?: unknown }).variant
      : undefined
  return value === "B" || value === "C" ? value : "A"
}
