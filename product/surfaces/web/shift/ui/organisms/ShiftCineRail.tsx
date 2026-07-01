import { motion } from "framer-motion"
import type { Ref } from "react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { ShiftCineTile } from "../molecules/ShiftCineTile"

const SPRING = { type: "spring", stiffness: 260, damping: 32 } as const

/** One game in the rail — the minimum the rail needs to render a tile. */
export interface ShiftCineRailGame {
  readonly id: string
  readonly title: string
  readonly tileArtUrl: string
  readonly tileArtAspectRatio?: string
}

/**
 * The Switch-style rail: tiles laid in a track that the owner shifts so the
 * focused tile stays centered (`trackX`, spring-animated). The rail is
 * presentational — focus and centering live in the owning screen; it forwards
 * `trackRef` for the centering math and reports tile focus/activation up.
 */
export function ShiftCineRail({
  games,
  index,
  trackX,
  trackRef,
  imageWindow,
  onTileFocus,
  onTileActivate,
}: {
  readonly games: readonly ShiftCineRailGame[]
  readonly index: number
  readonly trackX: number
  readonly trackRef: Ref<HTMLDivElement>
  readonly imageWindow?: { readonly start: number; readonly end: number }
  readonly onTileFocus: (index: number) => void
  readonly onTileActivate: (index: number) => void
}) {
  return (
    <div
      className="shift-cine-rail"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.rail)}
    >
      <motion.div
        className="shift-cine-track"
        ref={trackRef}
        animate={{ x: trackX }}
        transition={SPRING}
      >
        {games.map((entry, i) => (
          <ShiftCineTile
            key={entry.id}
            index={i}
            title={entry.title}
            artUrl={entry.tileArtUrl}
            aspectRatio={entry.tileArtAspectRatio}
            focused={i === index}
            renderImage={
              !imageWindow || (i >= imageWindow.start && i <= imageWindow.end)
            }
            onFocus={() => onTileFocus(i)}
            onActivate={() => onTileActivate(i)}
          />
        ))}
      </motion.div>
    </div>
  )
}
