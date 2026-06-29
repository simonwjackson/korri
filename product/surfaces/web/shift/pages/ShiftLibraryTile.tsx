/**
 * Shift library — cover tile (molecule).
 *
 * The one focusable unit both library variants render: a native, portrait cover
 * <button> with its title caption beneath. Source-agnostic — it takes a flat
 * ShiftLibraryGame and reports focus/activation through simple id callbacks, so
 * the platform focus engine (keyboard, gamepad, desktop bridge) drives it the
 * same way it drives the cinematic rail. The grid and shelf scopes size it via
 * CSS; the tile itself only declares its portrait aspect.
 */
import type { ShiftLibraryGame } from "./shift-library-game"

export interface ShiftLibraryTileProps {
  readonly game: ShiftLibraryGame
  /** Activate (confirm / click) the tile. The host opens detail or launches. */
  readonly onSelect?: (id: string) => void
  /** Real DOM focus landed on the tile (drives any focused-caption chrome). */
  readonly onFocus?: (id: string) => void
}

export function ShiftLibraryTile({
  game,
  onSelect,
  onFocus,
}: ShiftLibraryTileProps) {
  return (
    <button
      type="button"
      className="shift-lib-tile"
      aria-label={game.title}
      data-favorite={game.favorite || undefined}
      onFocus={() => onFocus?.(game.id)}
      onClick={() => onSelect?.(game.id)}
    >
      <span className="shift-lib-tile-art">
        <img src={game.artUrl} alt="" loading="lazy" />
        {game.favorite ? (
          <span className="shift-lib-tile-fav" aria-hidden>
            ★
          </span>
        ) : null}
      </span>
      <span className="shift-lib-tile-title">{game.title}</span>
    </button>
  )
}
