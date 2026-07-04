/**
 * The store layout variants as ONE product-owned registry: each entry pairs the
 * design-part identity with the real render for a given set of store entries.
 * Both the part catalog (`ShiftStore.template.part.tsx`) and the device-lab
 * screen catalog consume this registry, so adding, renaming, or rewiring a
 * variant happens in exactly one place.
 *
 * The store models a console storefront, but there is no purchase. Every variant
 * here is browse-first: a result is a navigation target that opens detail, there
 * is no in-place acquire chrome, and search + filtering share one compact
 * `Store Finder` pill whose filter fans out as an overlay (never pushing the
 * results down). Variants differ only in how results are laid out. All are
 * EXPLORATIONS (takes) marked with `data-proto`.
 */
import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS, type ShiftDesignPart } from "../shift-design-parts"
import { ShiftStoreBrowse } from "./ShiftStoreBrowse"
import { ShiftStoreDrawer } from "./ShiftStoreDrawer"
import { ShiftStoreIndex } from "./ShiftStoreIndex"
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
    part: SHIFT_DESIGN_PARTS.storeSpotlight,
    note: "Featured hero + rail; compact finder pill",
    render: entries => <ShiftStoreSpotlight entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeBrowse,
    note: "Browse grid, tiles open detail; compact finder pill",
    render: entries => <ShiftStoreBrowse entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeShelves,
    note: "Curated source shelves; compact finder pill",
    render: entries => <ShiftStoreShelves entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeIndex,
    note: "Alphabetical index rows; compact finder pill",
    render: entries => <ShiftStoreIndex entries={entries} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.storeDrawer,
    note: "Browse grid; maxed-out side panel (search, sort, every facet)",
    render: entries => <ShiftStoreDrawer entries={entries} />,
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
