/**
 * Shift library — Variant F: the Queue (backlog pipeline).
 *
 * The library as what you're doing, not what you own. The hero is whatever's
 * Now Playing (one button resumes it); the rest waits in Up Next and Backlog.
 * Triage is the verb: activating a shelf tile promotes it forward
 * (Backlog → Up Next → Now), so the pile becomes a pipeline you curate down to
 * the few games you actually care about. Lane derivation/grouping/promotion is
 * the shared pure queue core; this page owns only the live lane assignment.
 *
 * Interaction note: in the shelves a tile's activation PROMOTES (the pipeline
 * verb); the Now hero's Resume is the launch. That split is deliberate for the
 * prototype — the real route would surface promote as a secondary action.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftLibraryTile } from "./ShiftLibraryTile"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  deriveShiftLibraryQueue,
  promoteShiftLibraryLane,
  type ShiftLibraryLane,
  shiftLibraryLanes,
} from "./shift-library-queue"

export interface ShiftLibraryQueueProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly title?: string
  /** Resume / launch the Now game. */
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryQueue({
  games,
  title = "Library",
  onSelect,
  onBack,
}: ShiftLibraryQueueProps) {
  const [assignment, setAssignment] = useState<Map<string, ShiftLibraryLane>>(
    () => new Map(deriveShiftLibraryQueue(games)),
  )

  const lanes = useMemo(
    () => shiftLibraryLanes(games, assignment),
    [games, assignment],
  )
  const nowGame = lanes.find(lane => lane.id === "now")?.games[0]
  const queued = lanes.filter(lane => lane.id !== "now")

  const promote = (id: string) =>
    setAssignment(current => {
      const next = new Map(current)
      next.set(id, promoteShiftLibraryLane(current.get(id) ?? "backlog"))
      return next
    })

  useInputAction("back", () => onBack?.())

  return (
    <div data-shift-library className="shift-lib shift-lib-queue intrinsic">
      <header className="shift-lib-top">
        <h1 className="shift-lib-heading">{title}</h1>
      </header>

      {nowGame ? (
        <section className="shift-lib-now" aria-label="Now Playing">
          <span className="shift-lib-now-art">
            <img src={nowGame.artUrl} alt="" loading="lazy" />
          </span>
          <div className="shift-lib-now-meta">
            <span className="shift-lib-now-kicker">Now Playing</span>
            <h2 className="shift-lib-now-title">{nowGame.title}</h2>
            <button
              type="button"
              className="shift-lib-resume"
              onClick={() => onSelect?.(nowGame.id)}
            >
              ▶ Resume
            </button>
          </div>
        </section>
      ) : null}

      <div className="shift-lib-shelf-stack">
        {queued.map(lane => (
          <section key={lane.id} className="shift-lib-shelf">
            <h2 className="shift-lib-shelf-title">{lane.title}</h2>
            <div className="shift-lib-shelf-track">
              {lane.games.map(game => (
                <ShiftLibraryTile
                  key={game.id}
                  game={game}
                  onSelect={promote}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
