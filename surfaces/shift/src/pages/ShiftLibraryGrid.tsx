/**
 * Shift library — Variant A: additive cover grid.
 *
 * The catchall "browse everything" surface: one dense, scrollable grid of every
 * game as a portrait cover. The grid is ADDITIVE — it adds columns as the frame
 * widens (auto-fill + a base-relative min track), so a TV shows more games at
 * once rather than the same few zoomed up. Tiles are native focusable
 * <button>s, so the platform focus engine moves real DOM focus across the grid
 * (keyboard, gamepad, desktop bridge alike); confirm is the engine clicking the
 * focused tile (→ onSelect). Only the semantic `back` is consumed directly.
 *
 * Fixture-driven and source-agnostic: it takes flat ShiftLibraryGame[] and
 * reports selection by id. The composition root (lab config now, a route later)
 * supplies the data and decides what selection does (open detail / launch).
 */
import { useSurfaceAction } from "../host/surface-host"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftLibraryGridView } from "./ShiftLibraryGridView"
import { ShiftLibraryHeader } from "./ShiftLibraryHeader"
import type { ShiftLibraryGame } from "./shift-library-game"

export interface ShiftLibraryGridProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly title?: string
  /** Open / launch the activated game. Omitted in standalone fixture render. */
  readonly onSelect?: (id: string) => void
  /** Leave the library (semantic `back`). Omitted = inert. */
  readonly onBack?: () => void
}

export function ShiftLibraryGrid({
  games,
  title = "Library",
  onSelect,
  onBack,
}: ShiftLibraryGridProps) {
  // `back` is semantic, not a focus move, so the page consumes it directly.
  // No-op when no input system is running (standalone fixture render).
  useSurfaceAction("back", () => onBack?.())

  return (
    <div data-shift-library className="shift-lib intrinsic">
      <ShiftLibraryHeader title={title} count={games.length} />
      {games.length > 0 ? (
        <ShiftLibraryGridView games={games} onSelect={onSelect} />
      ) : (
        <ShiftLibraryEmpty />
      )}
    </div>
  )
}
