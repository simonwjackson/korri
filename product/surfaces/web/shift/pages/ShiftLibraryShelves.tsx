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
import { ShiftLibraryTile } from "./ShiftLibraryTile"
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
      <header className="shift-lib-top">
        <h1 className="shift-lib-heading">{title}</h1>
      </header>

      {sections.length > 0 ? (
        <div className="shift-lib-shelf-stack">
          {sections.map(section => (
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
      ) : (
        <p className="shift-lib-empty">No games found.</p>
      )}
    </div>
  )
}
