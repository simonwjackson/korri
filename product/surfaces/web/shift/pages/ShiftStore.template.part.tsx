/**
 * Shift Store — every store layout variant as a TEMPLATE state family.
 *
 * Each variant takes `entries` as a slot (source-agnostic layout), so it is a
 * template; a store page binds it to the live remote-catalog search later. The
 * variants are competing design explorations for the remote-catalog store (one
 * will be committed as Shift's store route); each is a real full-screen
 * composition with two real data states: Ready (the store fixture) and Empty
 * (no results). The variant identities and renders live in ONE product registry
 * (`shift-store-variants.tsx`) shared with the device-lab screen catalog, so
 * parts discovery collects exactly one story family per variant.
 */
import type { Story } from "@tools/theme-workshop"
import { SHIFT_STORE_ENTRIES } from "../config"
import {
  type ShiftStoreVariant,
  shiftStoreVariantForStory,
} from "./shift-store-variants"

function storeStates(variant: ShiftStoreVariant): readonly Story[] {
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
      render: () => variant.render(SHIFT_STORE_ENTRIES),
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
  const variant = shiftStoreVariantForStory({ name })
  if (!variant) throw new Error(`Unknown Shift store variant ${name}`)
  return storeStates(variant)
}

export const ShiftStoreGridStates = familyFor("Store — Grid")
export const ShiftStoreSpotlightStates = familyFor("Store — Spotlight")
export const ShiftStoreListStates = familyFor("Store — List")
export const ShiftStoreBrowseStates = familyFor("Store — Browse")
export const ShiftStoreShelvesStates = familyFor("Store — Shelves")
export const ShiftStoreIndexStates = familyFor("Store — Index")
