/**
 * Shift library — Variant G: the Deck (flickable cards).
 *
 * The engaging, games-as-the-whole-screen take: one game fills the frame — its
 * cover crisp over a blurred bleed of itself — and you riffle the stack like
 * cards. A directional flick (or the on-screen controls) drives it: left/right
 * riffles, up plays, down favourites; drag throws the card with spring physics.
 * Index math + the flick→intent mapping are the shared pure deck core, so the
 * flick and the buttons route through one place and the surface stays
 * device-agnostic. Favourites are widget-local triage, seeded from the data.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useMemo, useState } from "react"
import { advanceDeck, deckFlickFromDirection } from "./shift-library-deck"
import type { ShiftLibraryGame } from "./shift-library-game"

const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const

export interface ShiftLibraryDeckProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryDeck({
  games,
  onSelect,
  onBack,
}: ShiftLibraryDeckProps) {
  const [index, setIndex] = useState(0)
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(
    () => new Set(games.filter(game => game.favorite).map(game => game.id)),
  )
  const game = games[index]

  const riffle = useCallback(
    (step: "next" | "prev") =>
      setIndex(current => advanceDeck(current, games.length, step)),
    [games.length],
  )
  const play = useCallback(() => {
    if (game) onSelect?.(game.id)
  }, [game, onSelect])
  const toggleFavorite = useCallback(() => {
    if (!game) return
    setFavorites(previous => {
      const next = new Set(previous)
      if (next.has(game.id)) next.delete(game.id)
      else next.add(game.id)
      return next
    })
  }, [game])

  useInputAction("direction", ({ direction }) => {
    switch (deckFlickFromDirection(direction)) {
      case "next":
        return riffle("next")
      case "prev":
        return riffle("prev")
      case "play":
        return play()
      case "favorite":
        return toggleFavorite()
    }
  })
  useInputAction("back", () => onBack?.())

  const tags = useMemo(
    () =>
      game ? [game.genre, game.developer].filter(Boolean).join(" · ") : "",
    [game],
  )

  if (!game) {
    return (
      <div data-shift-library className="shift-lib shift-lib-deck intrinsic">
        <p className="shift-lib-empty">No games found.</p>
      </div>
    )
  }

  const favored = favorites.has(game.id)

  return (
    <div data-shift-library className="shift-lib shift-lib-deck intrinsic">
      <AnimatePresence>
        <motion.div
          key={`bleed:${game.id}`}
          className="shift-lib-deck-bleed"
          style={{ backgroundImage: `url(${game.artUrl})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      </AnimatePresence>
      <div className="shift-lib-deck-scrim" />

      <span className="shift-lib-deck-counter">
        {index + 1} / {games.length}
      </span>

      <div className="shift-lib-deck-stage">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={game.id}
            className="shift-lib-deck-card"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_event, info) => {
              if (info.offset.x < -80) riffle("next")
              else if (info.offset.x > 80) riffle("prev")
              else if (info.offset.y < -80) play()
            }}
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -24 }}
            transition={SPRING}
          >
            <img src={game.artUrl} alt="" draggable={false} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shift-lib-deck-hero">
        <h1 className="shift-lib-deck-title">{game.title}</h1>
        {tags ? <p className="shift-lib-deck-tags">{tags}</p> : null}
      </div>

      <div className="shift-lib-deck-actions">
        <button
          type="button"
          className="shift-lib-deck-arrow"
          aria-label="Previous game"
          onClick={() => riffle("prev")}
        >
          ‹
        </button>
        <button type="button" className="shift-lib-deck-play" onClick={play}>
          ▶ Play
        </button>
        <button
          type="button"
          className="shift-lib-deck-fav"
          aria-pressed={favored}
          onClick={toggleFavorite}
        >
          {favored ? "★" : "☆"} Favorite
        </button>
        <button
          type="button"
          className="shift-lib-deck-arrow"
          aria-label="Next game"
          onClick={() => riffle("next")}
        >
          ›
        </button>
      </div>
    </div>
  )
}
