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
import { motion } from "framer-motion"
import { useCallback, useMemo, useState } from "react"
import type { ShiftLibraryGame } from "./shift-library-game"
import { reelIndexFromSteps, reelWindow } from "./shift-library-reel"

const SPRING = { type: "spring", stiffness: 220, damping: 26 } as const

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

  const window = useMemo(
    () => reelWindow(center, games.length, 3),
    [center, games.length],
  )
  const centerGame = games[center]

  if (!centerGame) {
    return (
      <div data-shift-library className="shift-lib shift-lib-reel intrinsic">
        <p className="shift-lib-empty">No games found.</p>
      </div>
    )
  }

  return (
    <div data-shift-library className="shift-lib shift-lib-reel intrinsic">
      <div className="shift-lib-reel-stage">
        {window.map(itemIndex => {
          const offset = offsetFromCenter(itemIndex, center, games.length)
          const game = games[itemIndex]
          if (!game) return null
          const isCenter = offset === 0
          return (
            <motion.button
              type="button"
              key={game.id}
              className="shift-lib-reel-cover"
              data-center={isCenter || undefined}
              aria-label={game.title}
              aria-hidden={!isCenter}
              tabIndex={isCenter ? 0 : -1}
              onClick={() => (isCenter ? onSelect?.(game.id) : spin(offset))}
              animate={{
                x: `${offset * 64}%`,
                scale: isCenter ? 1.1 : 0.78,
                opacity: isCenter ? 1 : 0.45 - Math.abs(offset) * 0.08,
                zIndex: 10 - Math.abs(offset),
              }}
              transition={SPRING}
            >
              <img src={game.artUrl} alt="" loading="lazy" draggable={false} />
            </motion.button>
          )
        })}
      </div>

      <div className="shift-lib-reel-hero">
        <h1 className="shift-lib-reel-title">{centerGame.title}</h1>
        {centerGame.genre ? (
          <p className="shift-lib-reel-tags">{centerGame.genre}</p>
        ) : null}
      </div>

      <div className="shift-lib-reel-actions">
        <button type="button" className="shift-lib-reel-spin" onClick={fling}>
          🎰 Spin
        </button>
        <button
          type="button"
          className="shift-lib-reel-play"
          onClick={() => onSelect?.(centerGame.id)}
        >
          ▶ Play
        </button>
      </div>
    </div>
  )
}

/** Signed shortest distance from an index to the centre on the wheel. */
function offsetFromCenter(
  index: number,
  center: number,
  length: number,
): number {
  const raw = index - center
  const half = length / 2
  if (raw > half) return raw - length
  if (raw < -half) return raw + length
  return raw
}
