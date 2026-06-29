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
import { ShiftLibraryTile } from "./ShiftLibraryTile"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  applyShiftLibraryQuery,
  type ShiftLibrarySort,
  shiftLibrarySortLabel,
} from "./shift-library-query"
import { buildShiftLibraryGenreSections } from "./shift-library-sections"

type LibraryLens = "all" | "favorites" | "genre"

const LENSES: readonly { readonly id: LibraryLens; readonly label: string }[] =
  [
    { id: "all", label: "All" },
    { id: "favorites", label: "Favorites" },
    { id: "genre", label: "By Genre" },
  ]

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
      <header className="shift-lib-top">
        <h1 className="shift-lib-heading">{title}</h1>
        <button
          type="button"
          className="shift-lib-options-btn"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen(open => !open)}
        >
          Sort: {shiftLibrarySortLabel(sort)}
        </button>
      </header>

      <div
        className="shift-lib-lens-row"
        role="tablist"
        aria-label="Library lens"
      >
        {LENSES.map(option => (
          <button
            type="button"
            key={option.id}
            role="tab"
            className="shift-lib-lens-item"
            aria-selected={lens === option.id}
            data-active={lens === option.id || undefined}
            onClick={() => setLens(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {optionsOpen ? (
        <div className="shift-lib-options" role="toolbar" aria-label="Sort by">
          {SORTS.map(option => (
            <button
              type="button"
              key={option}
              className="shift-lib-option"
              data-active={sort === option || undefined}
              aria-pressed={sort === option}
              onClick={() => {
                setSort(option)
                setOptionsOpen(false)
              }}
            >
              {shiftLibrarySortLabel(option)}
            </button>
          ))}
        </div>
      ) : null}

      {lens === "genre" ? (
        <div className="shift-lib-shelf-stack">
          {genreSections.map(section => (
            <section key={section.id} className="shift-lib-shelf">
              <h2 className="shift-lib-shelf-title">{section.title}</h2>
              <div className="shift-lib-shelf-track">
                {section.games.map(game => (
                  <ShiftLibraryTile
                    key={game.id}
                    game={game}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : flat.length > 0 ? (
        <div className="shift-lib-grid">
          {flat.map(game => (
            <ShiftLibraryTile key={game.id} game={game} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <p className="shift-lib-empty">No favorites yet.</p>
      )}
    </div>
  )
}
