/**
 * Shift library — Variant B: sectioned shelves.
 *
 * The same library, browsed as a console home-OS would: horizontal shelves
 * grouped by intent (Continue Playing, Favorites, All Games), each a row of the
 * same cover tiles. Built to compare against the flat grid (Variant A) before
 * one is committed as Shift's library route. Tiles stay native focusable
 * <button>s so the platform focus engine moves between rows and along a row;
 * the shelf tracks scroll to keep the focused tile in view via the browser's
 * native focus scrolling. Only the semantic `back` is consumed directly.
 *
 * The page is a dumb composer: it takes already-grouped sections (built by the
 * pure buildShiftLibrarySections at the composition root) and reports selection
 * by id. It never groups data itself.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftLibraryHeader } from "./ShiftLibraryHeader"
import { ShiftLibraryShelfStack } from "./ShiftLibraryShelfStack"
import type { ShiftLibrarySection } from "./shift-library-sections"

export interface ShiftLibraryShelvesProps {
  readonly sections: readonly ShiftLibrarySection[]
  readonly title?: string
  /** Open / launch the activated game. Omitted in standalone fixture render. */
  readonly onSelect?: (id: string) => void
  /** Leave the library (semantic `back`). Omitted = inert. */
  readonly onBack?: () => void
}

export function ShiftLibraryShelves({
  sections,
  title = "Library",
  onSelect,
  onBack,
}: ShiftLibraryShelvesProps) {
  useInputAction("back", () => onBack?.())

  return (
    <div data-shift-library className="shift-lib shift-lib-shelves intrinsic">
      <ShiftLibraryHeader title={title} />
      {sections.length > 0 ? (
        <ShiftLibraryShelfStack sections={sections} onSelect={onSelect} />
      ) : (
        <ShiftLibraryEmpty />
      )}
    </div>
  )
}
