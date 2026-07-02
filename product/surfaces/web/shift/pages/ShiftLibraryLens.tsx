/**
 * Shift library — Variant C: lens + on-demand sort (progressive disclosure).
 *
 * The depth-with-restraint take: covers stay the hero, and the only standing
 * control is a single "lens" row that reframes the SAME games — All, Favorites,
 * or By Genre. Sorting is depth you summon: an Options button reveals the sort
 * choices, then gets out of the way, so no sort/filter chrome competes with the
 * games until you ask for it. By Genre renders the shared shelves; the flat
 * frames render the additive grid. All ordering/filtering is the shared pure
 * query core — this page only owns the control surface and its widget-local UI
 * state (which lens, which sort, overlay open).
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import {
  type ShiftLibraryLens as LibraryLens,
  ShiftLensRow,
} from "./ShiftLensRow"
import { ShiftLensSortButton } from "./ShiftLensSortButton"
import { ShiftLensSortOverlay } from "./ShiftLensSortOverlay"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftLibraryGridView } from "./ShiftLibraryGridView"
import { ShiftLibraryHeader } from "./ShiftLibraryHeader"
import { ShiftLibraryShelf } from "./ShiftLibraryShelf"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  applyShiftLibraryQuery,
  type ShiftLibrarySort,
} from "./shift-library-query"
import { buildShiftLibraryGenreSections } from "./shift-library-sections"

const SORTS: readonly ShiftLibrarySort[] = ["recent", "title", "playtime"]

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
  const [optionsOpen, setOptionsOpen] = useState(false)

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

  // `back` closes the summoned options first, then leaves the library.
  useInputAction("back", () => {
    if (optionsOpen) setOptionsOpen(false)
    else onBack?.()
  })

  return (
    <div data-shift-library className="shift-lib shift-lib-lens intrinsic">
      <ShiftLibraryHeader title={title}>
        <ShiftLensSortButton
          sort={sort}
          open={optionsOpen}
          onToggle={() => setOptionsOpen(open => !open)}
        />
      </ShiftLibraryHeader>

      <ShiftLensRow lens={lens} onSelect={setLens} />

      {optionsOpen ? (
        <ShiftLensSortOverlay
          sort={sort}
          sorts={SORTS}
          onPick={next => {
            setSort(next)
            setOptionsOpen(false)
          }}
        />
      ) : null}

      {lens === "genre" ? (
        <div className="shift-lib-shelf-stack">
          {genreSections.map(section => (
            <ShiftLibraryShelf
              key={section.id}
              title={section.title}
              games={section.games}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : flat.length > 0 ? (
        <ShiftLibraryGridView games={flat} onSelect={onSelect} />
      ) : (
        <ShiftLibraryEmpty message="No favorites yet." />
      )}
    </div>
  )
}
