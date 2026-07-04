/**
 * The store layout variants as ONE product-owned registry: each entry pairs the
 * design-part identity with the real render for a given set of store entries.
 * Both the part catalog (`ShiftStore.template.part.tsx`) and the device-lab
 * screen catalog consume this registry, so adding, renaming, or rewiring a
 * variant happens in exactly one place.
 *
 * The store models a console storefront, but there is no purchase. Two families
 * of exploration live here: an action-forward set (A–C) where each result
 * carries a Get/Play affordance, and a browse-first set (D–F) where a result is
 * a navigation target that opens detail and search is summoned rather than
 * standing. The dev-lab shows both so the control model can be judged.
 */
import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS, type ShiftDesignPart } from "../shift-design-parts"
import { ShiftStoreBrowse } from "./ShiftStoreBrowse"
import { ShiftStoreGrid } from "./ShiftStoreGrid"
import { ShiftStoreIndex } from "./ShiftStoreIndex"
import { ShiftStoreList } from "./ShiftStoreList"
import { ShiftStoreShelves } from "./ShiftStoreShelves"
import { ShiftStoreSpotlight } from "./ShiftStoreSpotlight"
import type { ShiftStoreEntry } from "./shift-store-entry"

export interface ShiftStoreVariant {
  readonly part: ShiftDesignPart
  readonly note: string
  readonly render: (entries: readonly ShiftStoreEntry[]) => ReactNode
}

export const SHIFT_STORE_VARIANTS: readonly ShiftStoreVariant[] = [
  {
    part: SHIFT_DESIGN_PARTS.storeGrid,
    note: "Variant A: search + additive result grid",
    render: entries => <ShiftStoreGrid entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeSpotlight,
    note: "Variant B: search-forward spotlight hero + rail",
    render: entries => <ShiftStoreSpotlight entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeList,
    note: "Variant C: dense search-results list",
    render: entries => <ShiftStoreList entries={entries} />,
  },
  // Second set — browse-first: a result opens detail (no per-item action), and
  // search is summoned, not standing.
  {
    part: SHIFT_DESIGN_PARTS.storeBrowse,
    note: "Variant D: browse grid, tiles open detail, summoned search",
    render: entries => <ShiftStoreBrowse entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeShelves,
    note: "Variant E: curated source shelves, summoned search",
    render: entries => <ShiftStoreShelves entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeIndex,
    note: "Variant F: alphabetical index rows, summoned search",
    render: entries => <ShiftStoreIndex entries={entries} />,
  },
]

/** Resolve a variant from a part story's identity (design part id first, then
 * the part name), so consumers never key on display text alone. */
export function shiftStoreVariantForStory(story: {
  readonly designPartId?: string
  readonly name: string
}): ShiftStoreVariant | undefined {
  return (
    SHIFT_STORE_VARIANTS.find(
      variant => variant.part.id === story.designPartId,
    ) ?? SHIFT_STORE_VARIANTS.find(variant => variant.part.name === story.name)
  )
}
