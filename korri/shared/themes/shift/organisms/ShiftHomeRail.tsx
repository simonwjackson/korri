/**
 * Shift organism — home rail.
 *
 * The horizontal rail of game tiles below the top bar. Composes the
 * primitive `TilegridRailRoot` and `TilegridCells`, then routes each
 * cell to either the feature tile (resume target) or the poster tile.
 *
 * Cell-size math:
 *   The square cell is 258px and rail gap is 18px. The feature tile
 *   spans 2 columns, so its visible width is 2*258 + 18 = 534px,
 *   yielding an aspect ratio of 534:258 ≈ 2.07:1. That is within ~3%
 *   of the strict 92:43 (2.14) Switch hero proportion at the same row
 *   height — imperceptible at TV viewing distance.
 *
 * Focus tracking is a single delegated React `onFocus` listener at
 * the rail wrapper. Cell buttons emit `data-tile-id` (added by
 * TilegridCells when the rail Root publishes per-item ids); reading
 * the id off the focused element and calling `focusTile(id)` keeps
 * the home's focused state in sync without per-cell hooks.
 *
 * The rail wrapper carries an explicit `height: CELL_SIZE_PX` because
 * `TilegridRailRoot`'s outer container is `height: 100%` and would
 * collapse without one. The inline style is the single derived link
 * from the TS constant; no other px values escape the theme system.
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
const CELL_SIZE_PX = 258
const RAIL_GAP_PX = 18

export function ShiftHomeRail() {
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
    <div
      ref={railRef}
      className="shift-home-rail-region px-12"
      style={{ height: CELL_SIZE_PX }}
    >
      <TilegridRailRoot<GameRecord>
        items={items}
        cellSize={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX }}
        gap={RAIL_GAP_PX}
        getKey={g => g.id}
        getSpan={g => (g.id === resumeTarget.id ? RESUME_SPAN : 1)}
        getAriaLabel={g => getGameDisplayName(g)}
      >
        <TilegridCells<GameRecord>
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
