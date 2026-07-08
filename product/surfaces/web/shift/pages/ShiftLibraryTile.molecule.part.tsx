/**
 * Library Tile — the one focusable unit every library variant renders, as a
 * molecule state family. Its two real presentation states are driven by the
 * favourite flag (the star badge). The SAME `ShiftLibraryTile` the variants
 * compose is the one rendered here, from the shared dev-media projection.
 */
import type { Story } from "@simonwjackson/caliper"
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryTile } from "./ShiftLibraryTile"

const game = SHIFT_LIBRARY_GAMES[0] ?? {
  id: "game",
  title: "Game",
  artUrl: "",
}

export const ShiftLibraryTileStates = [
  {
    id: "shift-library-tile-plain",
    designPartId: SHIFT_DESIGN_PARTS.libraryTile.id,
    layer: "molecule" as const,
    name: "Library Tile",
    note: "Tile states",
    state: "Plain",
    render: () => (
      <ShiftPartFrame width={220} height={360}>
        <ShiftLibraryTile game={{ ...game, favorite: false }} />
      </ShiftPartFrame>
    ),
  },
  {
    id: "shift-library-tile-favorite",
    designPartId: SHIFT_DESIGN_PARTS.libraryTile.id,
    layer: "molecule" as const,
    name: "Library Tile",
    note: "Tile states",
    state: "Favorite",
    render: () => (
      <ShiftPartFrame width={220} height={360}>
        <ShiftLibraryTile game={{ ...game, favorite: true }} />
      </ShiftPartFrame>
    ),
  },
] satisfies readonly Story[]
