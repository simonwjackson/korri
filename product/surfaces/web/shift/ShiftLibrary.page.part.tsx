/**
 * Shift Library — Data states as a part-catalog state family.
 *
 * The committed library page (the Lens variant bound to the catalog) rendered
 * through each catalog display state (Loading / Ready / Empty / LoadError /
 * Defect) via the REAL page composition (`ShiftLibraryStateView`) — the same
 * component the live `/library` route renders. One renderer for the gallery and
 * production; the state machine, not a hand-mapped switch, decides which body
 * shows. Mirrors `ShiftHome.page.part.tsx`; static (no backend, no router).
 *
 * The source-agnostic layout explorations still live as TEMPLATE families in
 * `ShiftLibrary.template.part.tsx`; this is the page-layer counterpart now that
 * the Lens is a real route.
 */
import { CATALOG_DISPLAY_TAGS } from "@platform/catalog/catalog-state-samples"
import type { Story } from "@simonwjackson/caliper"
import { ShiftLibraryStateView } from "./routes/ShiftLibraryRoute"
import { shiftCatalogStateSamples } from "./shift-catalog-state-samples"
import { SHIFT_DESIGN_PARTS } from "./shift-design-parts"

export const ShiftLibraryStates = CATALOG_DISPLAY_TAGS.map(tag => ({
  id: `shift-library-${tag.toLowerCase()}`,
  designPartId: SHIFT_DESIGN_PARTS.library.id,
  layer: "page" as const,
  name: "Library",
  note: "Data states",
  surface: true,
  state: tag,
  render: () => (
    <ShiftLibraryStateView result={shiftCatalogStateSamples[tag]()} />
  ),
})) satisfies readonly Story[]
