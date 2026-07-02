/**
 * Shift Library — every library layout variant as a TEMPLATE state family.
 * Each variant takes `games` as a slot (source-agnostic layout), so it is a
 * template; a library page would bind it to a committed source/route.
 *
 * The variants are competing design explorations (one control model will be
 * committed as Shift's library route later); each is a real full-screen
 * composition with two real data states: Ready (the dev-media projection) and
 * Empty (the component's own empty rendering). The variant identities and
 * renders live in ONE product registry (`shift-library-variants.tsx`) shared
 * with the dev-lab's source-swapped render; these dedicated part files
 * replace the coarse `ShiftScreens` bridge for Library, so parts discovery
 * collects exactly one story family per variant.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_LIBRARY_GAMES } from "../config"
import {
  type ShiftLibraryVariant,
  shiftLibraryVariantForStory,
} from "./shift-library-variants"

function libraryStates(variant: ShiftLibraryVariant): readonly Story[] {
  const slug = variant.part.id.replace("shift.", "")
  return [
    {
      id: `shift-${slug}-ready`,
      designPartId: variant.part.id,
      layer: "template" as const,
      name: variant.part.name,
      note: variant.note,
      surface: true,
      state: "Ready",
      render: () => variant.render(SHIFT_LIBRARY_GAMES),
    },
    {
      id: `shift-${slug}-empty`,
      designPartId: variant.part.id,
      layer: "template" as const,
      name: variant.part.name,
      note: variant.note,
      surface: true,
      state: "Empty",
      render: () => variant.render([]),
    },
  ]
}

function familyFor(name: string): readonly Story[] {
  const variant = shiftLibraryVariantForStory({ name })
  if (!variant) throw new Error(`Unknown Shift library variant ${name}`)
  return libraryStates(variant)
}

export const ShiftLibraryGridStates = familyFor("Library — Grid")
export const ShiftLibraryShelvesStates = familyFor("Library — Shelves")
export const ShiftLibraryLensStates = familyFor("Library — Lens")
export const ShiftLibraryFilterBarStates = familyFor("Library — Filter Bar")
export const ShiftLibraryDeckStates = familyFor("Library — Deck")
export const ShiftLibraryReelStates = familyFor("Library — Reel")
