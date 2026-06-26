/**
 * Gallery part — the home across every CATALOG DATA state (loading / error /
 * empty / ready / defect), derived from `ShiftCatalogState.tags`.
 *
 * Unlike the launch states (a plain prop), these are SEEDED: each entry feeds a
 * representative `AsyncResult` into the real `ShiftHomeStateView`, and the state
 * machine decides which body renders — the same path the live route takes. The
 * producer is exhaustive, so a new data state can't be added without showing up
 * here. This proves the derive-don't-author pattern for data-backed states, not
 * just prop-driven ones.
 */
import { RegistryProvider } from "@effect/atom-react"
import { stateVariants } from "@platform/state/state-variants"
import type { Story } from "@tools/theme-workshop"
import { ShiftCatalogState } from "../catalog/shift-catalog-state"
import { ShiftHomeStateView } from "../routes/ShiftHomeRoute"
import { shiftCatalogStateSamples } from "../shift-catalog-state-samples"

const dataStates = stateVariants(ShiftCatalogState, shiftCatalogStateSamples)

export const ShiftCatalogHomeStates = dataStates.map(variant => ({
  id: `shift-home-data-${variant.tag.toLowerCase()}`,
  layer: "page" as const,
  name: `Home · ${variant.label}`,
  note: "Data states",
  surface: true,
  render: () => (
    <RegistryProvider>
      <ShiftHomeStateView result={variant.value} />
    </RegistryProvider>
  ),
})) satisfies readonly Story[]
