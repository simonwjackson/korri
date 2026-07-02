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
import { useCallback, useMemo, useState } from "react"
import { ShiftDeckActions } from "./ShiftDeckActions"
import { ShiftDeckBleed } from "./ShiftDeckBleed"
import { ShiftDeckCard } from "./ShiftDeckCard"
import { ShiftDeckCounter } from "./ShiftDeckCounter"
import { ShiftDeckHero } from "./ShiftDeckHero"
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { advanceDeck, deckFlickFromDirection } from "./shift-library-deck"
import type { ShiftLibraryGame } from "./shift-library-game"

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
        <ShiftLibraryEmpty />
      </div>
    )
  }

  const favored = favorites.has(game.id)

  return (
    <div data-shift-library className="shift-lib shift-lib-deck intrinsic">
      <ShiftDeckBleed artUrl={game.artUrl} gameId={game.id} />
      <ShiftDeckCounter position={index + 1} total={games.length} />
      <ShiftDeckCard game={game} onRiffle={riffle} onPlay={play} />
      <ShiftDeckHero title={game.title} tags={tags} />
      <ShiftDeckActions
        favored={favored}
        onPrev={() => riffle("prev")}
        onNext={() => riffle("next")}
        onPlay={play}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  )
}
