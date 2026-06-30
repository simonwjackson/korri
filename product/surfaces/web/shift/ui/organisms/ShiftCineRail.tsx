import { motion } from "framer-motion"
import type { Ref } from "react"
import { ShiftCineTile } from "../molecules/ShiftCineTile"

const SPRING = { type: "spring", stiffness: 260, damping: 32 } as const

/** One game in the rail — the minimum the rail needs to render a tile. */
export interface ShiftCineRailGame {
  readonly id: string
  readonly title: string
  readonly tileArtUrl: string
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
  onTileFocus,
  onTileActivate,
}: {
  readonly games: readonly ShiftCineRailGame[]
  readonly index: number
  readonly trackX: number
  readonly trackRef: Ref<HTMLDivElement>
  readonly onTileFocus: (index: number) => void
  readonly onTileActivate: (index: number) => void
}) {
  return (
    <div className="shift-cine-rail">
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
            focused={i === index}
            onFocus={() => onTileFocus(i)}
            onActivate={() => onTileActivate(i)}
          />
        ))}
      </motion.div>
    </div>
  )
}
