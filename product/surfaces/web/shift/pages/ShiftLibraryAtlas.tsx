/**
 * Shift library — Variant I: the Atlas (zoomable territory map).
 *
 * The library as a place. Games live at fixed positions clustered into genre
 * "territories"; you pan across the map and zoom in, building spatial memory of
 * where things live rather than reading a list. Layout is the shared pure atlas
 * core; this page pans/zooms by translating the board so the focused territory
 * centres (CSS transition does the gliding) and reads covers through the shared
 * tile. A heavier, walkable 3D realisation of the same idea is the boxbuster
 * surface; this is the in-surface, controller-pannable version.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { type CSSProperties, useMemo, useState } from "react"
import { ShiftLibraryTile } from "./ShiftLibraryTile"
import { buildShiftLibraryAtlas } from "./shift-library-atlas"
import type { ShiftLibraryGame } from "./shift-library-game"

export interface ShiftLibraryAtlasProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryAtlas({
  games,
  onSelect,
  onBack,
}: ShiftLibraryAtlasProps) {
  const atlas = useMemo(() => buildShiftLibraryAtlas(games), [games])
  const [focus, setFocus] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  const { columns, clusters } = atlas
  const focused = clusters[focus]

  const pan = (direction: "up" | "down" | "left" | "right") => {
    const col = focus % columns
    const row = Math.floor(focus / columns)
    const nextCol =
      col + (direction === "right" ? 1 : direction === "left" ? -1 : 0)
    const nextRow =
      row + (direction === "down" ? 1 : direction === "up" ? -1 : 0)
    if (nextCol < 0 || nextCol >= columns) return
    const nextIndex = nextRow * columns + nextCol
    if (nextIndex >= 0 && nextIndex < clusters.length) setFocus(nextIndex)
  }

  useInputAction("direction", ({ direction }) => pan(direction))
  useInputAction("confirm", () => setZoomed(true))
  useInputAction("back", () => {
    if (zoomed) setZoomed(false)
    else onBack?.()
  })

  if (!focused) {
    return (
      <div data-shift-library className="shift-lib shift-lib-atlas intrinsic">
        <p className="shift-lib-empty">No games found.</p>
      </div>
    )
  }

  const boardStyle = {
    "--atlas-columns": columns,
    "--atlas-col": focus % columns,
    "--atlas-row": Math.floor(focus / columns),
    "--atlas-zoom": zoomed ? 1 : 0.62,
  } as CSSProperties

  return (
    <div data-shift-library className="shift-lib shift-lib-atlas intrinsic">
      <header className="shift-lib-top">
        <h1 className="shift-lib-heading">Atlas</h1>
        <button
          type="button"
          className="shift-lib-options-btn"
          aria-pressed={zoomed}
          onClick={() => setZoomed(value => !value)}
        >
          {zoomed ? "Zoom out" : `Zoom into ${focused.label}`}
        </button>
      </header>

      <div
        className="shift-lib-atlas-viewport"
        data-zoomed={zoomed || undefined}
      >
        <div className="shift-lib-atlas-board" style={boardStyle}>
          {clusters.map((cluster, index) => (
            <section
              key={cluster.id}
              className="shift-lib-atlas-territory"
              data-focused={index === focus || undefined}
            >
              <h2 className="shift-lib-atlas-label">{cluster.label}</h2>
              <div className="shift-lib-atlas-covers">
                {cluster.games.map(game => (
                  <ShiftLibraryTile
                    key={game.id}
                    game={game}
                    onSelect={onSelect}
                    onFocus={() => setFocus(index)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
