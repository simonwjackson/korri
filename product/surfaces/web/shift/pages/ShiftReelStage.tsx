/**
 * Shift library — the Reel wheel stage (organism).
 *
 * The spinning wheel itself: it renders the window of covers around the centre
 * and maps each to its signed offset, so the centre cover reads as the hero and
 * its neighbours peek either side. Selecting the centre confirms; selecting a
 * neighbour spins it in by its offset.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftReelCover } from "./ShiftReelCover"
import type { ShiftLibraryGame } from "./shift-library-game"
import { reelOffsetFromCenter, reelWindow } from "./shift-library-reel"

export interface ShiftReelStageProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly center: number
  /** Spin the wheel by a signed number of notches. */
  readonly onSpinBy: (delta: number) => void
  readonly onSelect?: (id: string) => void
  readonly radius?: number
}

export function ShiftReelStage({
  games,
  center,
  onSpinBy,
  onSelect,
  radius = 3,
}: ShiftReelStageProps) {
  const window = reelWindow(center, games.length, radius)
  return (
    <div
      className="shift-lib-reel-stage"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.reelStage)}
    >
      {window.map(itemIndex => {
        const offset = reelOffsetFromCenter(itemIndex, center, games.length)
        const game = games[itemIndex]
        if (!game) return null
        const isCenter = offset === 0
        return (
          <ShiftReelCover
            key={game.id}
            game={game}
            offset={offset}
            isCenter={isCenter}
            onActivate={() =>
              isCenter ? onSelect?.(game.id) : onSpinBy(offset)
            }
          />
        )
      })}
    </div>
  )
}
