/**
 * Shift library — Variant H: the Reel (momentum wheel).
 *
 * A wheel of covers you spin: one cover sits enlarged at the centre with its
 * neighbours peeking either side, and Spin flings it to a fresh game so
 * discovery has a bit of serendipity. Directional input or the controls advance
 * one notch; the spring does the coast-and-snap. The wheel geometry (wrapping a
 * spin to an index, which neighbours to render) is the shared pure reel core;
 * this page owns the physics and the chrome.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useCallback, useState } from "react"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftReelActions } from "./ShiftReelActions"
import { ShiftReelHero } from "./ShiftReelHero"
import { ShiftReelStage } from "./ShiftReelStage"
import type { ShiftLibraryGame } from "./shift-library-game"
import { reelIndexFromSteps } from "./shift-library-reel"

export interface ShiftLibraryReelProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryReel({
  games,
  onSelect,
  onBack,
}: ShiftLibraryReelProps) {
  const [center, setCenter] = useState(0)

  const spin = useCallback(
    (delta: number) =>
      setCenter(current => reelIndexFromSteps(current + delta, games.length)),
    [games.length],
  )
  // A bigger, varied jump so the wheel "throws" rather than steps.
  const fling = useCallback(() => spin(3 + (center % 4)), [spin, center])

  useInputAction("direction", ({ direction }) => {
    if (direction === "right") spin(1)
    else if (direction === "left") spin(-1)
  })
  useInputAction("back", () => onBack?.())

  const centerGame = games[center]

  if (!centerGame) {
    return (
      <div data-shift-library className="shift-lib shift-lib-reel intrinsic">
        <ShiftLibraryEmpty />
      </div>
    )
  }

  return (
    <div data-shift-library className="shift-lib shift-lib-reel intrinsic">
      <ShiftReelStage
        games={games}
        center={center}
        onSpin={spin}
        onSelect={onSelect}
      />
      <ShiftReelHero title={centerGame.title} genre={centerGame.genre} />
      <ShiftReelActions
        onSpin={fling}
        onPlay={() => onSelect?.(centerGame.id)}
      />
    </div>
  )
}
