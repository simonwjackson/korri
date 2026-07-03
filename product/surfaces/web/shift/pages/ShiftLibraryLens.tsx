/**
 * Shift library — Variant C: lens + standing placard sort.
 *
 * The depth-with-restraint take: covers stay the hero. Two standing controls
 * reframe the SAME games without competing with the art — a "lens" row (All,
 * Favorites, By Genre) and a quiet "placard" sort caption (Recent → A–Z →
 * Playtime, cycled in place). By Genre renders the shared shelves; the flat
 * frames render the additive grid. All ordering/filtering is the shared pure
 * query core — this page only owns the control surface and its widget-local UI
 * state (which lens, which sort).
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import {
  type ShiftLibraryLens as LibraryLens,
  ShiftLensRow,
} from "./ShiftLensRow"
import { ShiftLensSort } from "./ShiftLensSort"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftLibraryGridView } from "./ShiftLibraryGridView"
import { ShiftLibraryHeader } from "./ShiftLibraryHeader"
import { ShiftLibraryShelfStack } from "./ShiftLibraryShelfStack"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  applyShiftLibraryQuery,
  type ShiftLibrarySort,
} from "./shift-library-query"
import { buildShiftLibraryGenreSections } from "./shift-library-sections"

export interface ShiftLibraryLensProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly title?: string
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryLens({
  games,
  title = "Library",
  onSelect,
  onBack,
}: ShiftLibraryLensProps) {
  const [lens, setLens] = useState<LibraryLens>("all")
  const [sort, setSort] = useState<ShiftLibrarySort>("recent")

  const flat = useMemo(
    () =>
      applyShiftLibraryQuery(games, {
        sort,
        favoriteOnly: lens === "favorites",
        genres: [],
      }),
    [games, sort, lens],
  )
  const genreSections = useMemo(
    () => buildShiftLibraryGenreSections(games),
    [games],
  )

  useInputAction("back", () => onBack?.())

  return (
    <div data-shift-library className="shift-lib shift-lib-lens intrinsic">
      <ShiftLibraryHeader title={title}>
        <ShiftLensSort sort={sort} onChange={setSort} />
      </ShiftLibraryHeader>

      <ShiftLensRow lens={lens} onSelect={setLens} />

      {lens === "genre" ? (
        <ShiftLibraryShelfStack sections={genreSections} onSelect={onSelect} />
      ) : flat.length > 0 ? (
        <ShiftLibraryGridView games={flat} onSelect={onSelect} />
      ) : (
        <ShiftLibraryEmpty message="No favorites yet." />
      )}
    </div>
  )
}
