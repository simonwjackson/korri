/**
 * The Library layout variants as ONE product-owned registry: each entry pairs
 * the design part identity with the real render for a given game projection.
 * Both the part catalog (`ShiftLibrary.page.part.tsx`) and the dev-lab's
 * source-swapped placed-part render consume this registry, so adding,
 * renaming, or rewiring a variant happens in exactly one place.
 */
import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS, type ShiftDesignPart } from "../shift-design-parts"
import { ShiftLibraryDeck } from "./ShiftLibraryDeck"
import { ShiftLibraryFilterBar } from "./ShiftLibraryFilterBar"
import { ShiftLibraryGrid } from "./ShiftLibraryGrid"
import { ShiftLibraryLens } from "./ShiftLibraryLens"
import { ShiftLibraryReel } from "./ShiftLibraryReel"
import { ShiftLibraryShelves } from "./ShiftLibraryShelves"
import type { ShiftLibraryGame } from "./shift-library-game"
import { buildShiftLibrarySections } from "./shift-library-sections"

export interface ShiftLibraryVariant {
  readonly part: ShiftDesignPart
  readonly note: string
  readonly render: (games: readonly ShiftLibraryGame[]) => ReactNode
}

export const SHIFT_LIBRARY_VARIANTS: readonly ShiftLibraryVariant[] = [
  {
    part: SHIFT_DESIGN_PARTS.libraryGrid,
    note: "Variant A: additive cover grid",
    render: games => <ShiftLibraryGrid games={games} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.libraryShelves,
    note: "Variant B: sectioned shelves",
    render: games => (
      <ShiftLibraryShelves sections={buildShiftLibrarySections(games)} />
    ),
  },
  {
    part: SHIFT_DESIGN_PARTS.libraryLens,
    note: "Variant C: lens + summoned sort (progressive disclosure)",
    render: games => <ShiftLibraryLens games={games} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.libraryFilterBar,
    note: "Variant D: persistent filter + sort bar",
    render: games => <ShiftLibraryFilterBar games={games} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.libraryDeck,
    note: "Variant G: flickable full-screen cards",
    render: games => <ShiftLibraryDeck games={games} />,
  },
  {
    part: SHIFT_DESIGN_PARTS.libraryReel,
    note: "Variant H: spinnable momentum wheel",
    render: games => <ShiftLibraryReel games={games} />,
  },
]

/** Resolve a variant from a part story's identity (design part id first, then
 * the part name), so consumers never key on display text alone. */
export function shiftLibraryVariantForStory(story: {
  readonly designPartId?: string
  readonly name: string
}): ShiftLibraryVariant | undefined {
  return (
    SHIFT_LIBRARY_VARIANTS.find(
      variant => variant.part.id === story.designPartId,
    ) ??
    SHIFT_LIBRARY_VARIANTS.find(variant => variant.part.name === story.name)
  )
}
