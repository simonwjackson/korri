/**
 * Shift Library — every library layout variant as a page-layer state family.
 *
 * The variants are competing design explorations (one control model will be
 * committed as Shift's library route later); each is a real full-screen
 * composition with two real data states: Ready (the dev-media projection) and
 * Empty (the component's own empty rendering). These dedicated part files
 * replace the coarse `ShiftScreens` bridge for Library, so parts discovery
 * collects exactly one story family per variant.
 */
import type { Story } from "@tools/theme-workshop"
import type { ReactNode } from "react"
import { SHIFT_LIBRARY_GAMES, SHIFT_LIBRARY_SECTIONS } from "../config"
import { SHIFT_DESIGN_PARTS, type ShiftDesignPart } from "../shift-design-parts"
import { ShiftLibraryDeck } from "./ShiftLibraryDeck"
import { ShiftLibraryFilterBar } from "./ShiftLibraryFilterBar"
import { ShiftLibraryGrid } from "./ShiftLibraryGrid"
import { ShiftLibraryLens } from "./ShiftLibraryLens"
import { ShiftLibraryReel } from "./ShiftLibraryReel"
import { ShiftLibraryShelves } from "./ShiftLibraryShelves"
import type { ShiftLibraryGame } from "./shift-library-game"

function libraryStates(
  part: ShiftDesignPart,
  note: string,
  render: (games: readonly ShiftLibraryGame[]) => ReactNode,
): readonly Story[] {
  const slug = part.id.replace("shift.", "")
  return [
    {
      id: `shift-${slug}-ready`,
      designPartId: part.id,
      layer: "page" as const,
      name: part.name,
      note,
      surface: true,
      state: "Ready",
      render: () => render(SHIFT_LIBRARY_GAMES),
    },
    {
      id: `shift-${slug}-empty`,
      designPartId: part.id,
      layer: "page" as const,
      name: part.name,
      note,
      surface: true,
      state: "Empty",
      render: () => render([]),
    },
  ]
}

export const ShiftLibraryGridStates = libraryStates(
  SHIFT_DESIGN_PARTS.libraryGrid,
  "Variant A: additive cover grid",
  games => <ShiftLibraryGrid games={games} />,
)

export const ShiftLibraryShelvesStates = libraryStates(
  SHIFT_DESIGN_PARTS.libraryShelves,
  "Variant B: sectioned shelves",
  games => (
    <ShiftLibraryShelves
      sections={games.length > 0 ? SHIFT_LIBRARY_SECTIONS : []}
    />
  ),
)

export const ShiftLibraryLensStates = libraryStates(
  SHIFT_DESIGN_PARTS.libraryLens,
  "Variant C: lens + summoned sort (progressive disclosure)",
  games => <ShiftLibraryLens games={games} />,
)

export const ShiftLibraryFilterBarStates = libraryStates(
  SHIFT_DESIGN_PARTS.libraryFilterBar,
  "Variant D: persistent filter + sort bar",
  games => <ShiftLibraryFilterBar games={games} />,
)

export const ShiftLibraryDeckStates = libraryStates(
  SHIFT_DESIGN_PARTS.libraryDeck,
  "Variant G: flickable full-screen cards",
  games => <ShiftLibraryDeck games={games} />,
)

export const ShiftLibraryReelStates = libraryStates(
  SHIFT_DESIGN_PARTS.libraryReel,
  "Variant H: spinnable momentum wheel",
  games => <ShiftLibraryReel games={games} />,
)
