/**
 * Shift organism — home rail.
 *
 * The horizontal rail of game tiles below the top bar. Composes the
 * primitive `TilegridRailRoot` and `TilegridCells`, then routes each
 * cell to either the feature tile (resume target) or the poster tile.
 *
 * Cell-size math:
 *   Rail dimensions are Shift theme tokens, not component-local pixels.
 *   The feature tile spans two columns, so its visible width is
 *   2*cell + gap. The current token calibration preserves the Switch-like
 *   landscape-to-poster proportion while letting the theme own the raw
 *   numeric values.
 *
 * Focus tracking is a single delegated React `onFocus` listener at
 * the rail wrapper. Cell buttons emit `data-tile-id` (added by
 * TilegridCells when the rail Root publishes per-item ids); reading
 * the id off the focused element and calling `focusTile(id)` keeps
 * the home's focused state in sync without per-cell hooks.
 *
 * The rail wrapper height lives in shift.css because `TilegridRailRoot`'s
 * outer container is `height: 100%` and would collapse without an owning
 * block size. Tilegrid receives the same token through its CSS-length prop
 * path, so JS layout math and CSS layout share one source of truth.
 */

import {
  type GameRecord,
  getGameDisplayName,
} from "@shared/fixtures/games/game"
import { TilegridCells } from "@shared/primitives/components/Tilegrid/components/TilegridCells"
import { TilegridRailRoot } from "@shared/primitives/components/Tilegrid/TilegridRailRoot"
import { useEffect } from "react"
import { ShiftTile } from "../atoms/ShiftTile"
import { ShiftHomeFeatureTile } from "../molecules/ShiftHomeFeatureTile"
import { ShiftHomePosterTile } from "../molecules/ShiftHomePosterTile"
import { useShiftHome } from "../templates/ShiftHome.context"

const RESUME_SPAN = 2
const RAIL_CELL_SIZE = "var(--shift-home-rail-cell-size)"
const RAIL_GAP = "var(--shift-home-rail-gap)"

export interface ShiftHomeRailProps {
  readonly onItemClick?: (game: GameRecord) => void
}

export function ShiftHomeRail({ onItemClick }: ShiftHomeRailProps = {}) {
  const { items, resumeTarget, railRef, focusTile } = useShiftHome()

  // Delegated focus tracking: a single capture-style focusin listener
  // on the rail wrapper reads the focused cell's data-tile-id and
  // calls focusTile. Native focusin (rather than React onFocus) keeps
  // the rail wrapper a plain non-interactive container — onFocus on a
  // <div> trips the a11y/noStaticElementInteractions rule, and the
  // wrapper is a layout host, not an interactive element.
  useEffect(() => {
    const region = railRef.current
    if (!region) return
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      const id = target?.dataset.tileId
      if (id) focusTile(id)
    }
    region.addEventListener("focusin", onFocusIn)
    return () => region.removeEventListener("focusin", onFocusIn)
  }, [railRef, focusTile])

  return (
    <div ref={railRef} className="shift-home-rail-region px-12">
      <TilegridRailRoot<GameRecord>
        items={items}
        cellSize={{ width: RAIL_CELL_SIZE, height: RAIL_CELL_SIZE }}
        gap={RAIL_GAP}
        getKey={g => g.id}
        getSpan={g => (g.id === resumeTarget.id ? RESUME_SPAN : 1)}
        getAriaLabel={g => getGameDisplayName(g)}
      >
        <TilegridCells<GameRecord>
          onItemClick={onItemClick}
          renderCell={({ cellProps, item }) => (
            <ShiftTile {...cellProps} style={cellProps.style}>
              {item.id === resumeTarget.id ? (
                <ShiftHomeFeatureTile game={item} />
              ) : (
                <ShiftHomePosterTile game={item} />
              )}
            </ShiftTile>
          )}
        />
      </TilegridRailRoot>
    </div>
  )
}
