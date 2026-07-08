/**
 * Shift Home — Data states as a part-catalog state family.
 *
 * Each catalog display state (Loading / Ready / Empty / LoadError / Defect) is a
 * fixture-backed variant fed through the REAL home composition
 * (`ShiftHomeStateView`) — the same component the live route renders. There is
 * one renderer for the gallery, the Compose board, and production; the state
 * machine — not a hand-mapped switch — decides which body renders. The dev-lab
 * States panel switches between them while inspecting the part.
 *
 * Rendered without a coordinate owner, so these gallery variants never publish
 * to the capture seam (see `ShiftHomeStateView` / `shift-live-coordinate`).
 */
import { CATALOG_DISPLAY_TAGS } from "@platform/catalog/catalog-state-samples"
import type { Story } from "@simonwjackson/caliper"
import { ShiftHomeStateView } from "./routes/ShiftHomeRoute"
import { shiftCatalogStateSamples } from "./shift-catalog-state-samples"
import { SHIFT_DESIGN_PARTS } from "./shift-design-parts"

export const ShiftHomeStates = CATALOG_DISPLAY_TAGS.map(tag => ({
  id: `shift-home-${tag.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.home.id,
  layer: "page" as const,
  name: "Home",
  note: "Data states",
  surface: true,
  state: tag,
  render: () => <ShiftHomeStateView result={shiftCatalogStateSamples[tag]()} />,
})) satisfies readonly Story[]
