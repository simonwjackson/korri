// Exploration plumbing (not shipped, not a catalog entry): the shared cinematic
// scene for the rail-segmentation header studies. Each `*.template.part.tsx`
// variant imports this and only swaps how a segment's header renders, so every
// study is judged against an identical home (backdrop / status / hero / legend /
// segmented rail) built from the real ShiftCine primitives + tokens. Static
// still; no production component is touched.
import type { ReactNode } from "react"
import { SHIFT_CINEMATIC_GAMES } from "./config"
import type { ShiftCinematicGame } from "./pages/ShiftCinematicHome"
import { ShiftCineBackdrop } from "./ui/molecules/ShiftCineBackdrop"
import {
  type ShiftCineHintSpec,
  ShiftCineLegend,
} from "./ui/molecules/ShiftCineLegend"
import { ShiftCineTile } from "./ui/molecules/ShiftCineTile"
import { ShiftStatusBar } from "./ui/molecules/ShiftStatusBar"
import { ShiftCineHero } from "./ui/organisms/ShiftCineHero"

const recents = SHIFT_CINEMATIC_GAMES.filter(game => game.lastPlayedLabel)
const favorites = SHIFT_CINEMATIC_GAMES.filter(
  game => game.favorite && !game.lastPlayedLabel,
)
const freshPicks = SHIFT_CINEMATIC_GAMES.filter(
  game => !game.lastPlayedLabel && !game.favorite,
)

export interface RailSegmentTile {
  readonly game: ShiftCinematicGame
  readonly index: number
}
export interface RailSegment {
  readonly id: string
  readonly label: string
  readonly tiles: readonly RailSegmentTile[]
}

export const RAIL_SEGMENTS: readonly RailSegment[] = (() => {
  const source = [
    { id: "continue", label: "Continue", games: recents.slice(0, 3) },
    { id: "favorites", label: "Favorites", games: favorites.slice(0, 3) },
    { id: "fresh", label: "Fresh picks", games: freshPicks.slice(0, 3) },
  ].filter(segment => segment.games.length > 0)
  let running = 0
  return source.map(segment => {
    const tiles = segment.games.map((game, i) => ({ game, index: running + i }))
    running += segment.games.length
    return { id: segment.id, label: segment.label, tiles }
  })
})()

const FOCUSED_GAME =
  RAIL_SEGMENTS[0]?.tiles[0]?.game ?? SHIFT_CINEMATIC_GAMES[0]

const HINTS: readonly ShiftCineHintSpec[] = [
  { glyph: "A", label: "Play", primary: true },
  { glyph: "X", label: "Options" },
  { glyph: "Y", label: "Favorite" },
]

// Shared layout for every study: the grouped track and per-group column. Scoped
// to `[data-rail-seg]` so it never touches the real home rail. Header-specific
// styling is layered on per variant via `headerCss`.
const BASE_CSS = `
[data-rail-seg] .shift-cine-track {
  align-items: flex-end;
  gap: calc(var(--cine-tile) * 0.44);
}
[data-rail-seg] .rail-seg {
  display: flex;
  flex-direction: column;
  gap: var(--shift-space-2);
}
[data-rail-seg] .rail-seg-tiles {
  display: flex;
  gap: var(--shift-space-3);
  align-items: flex-end;
}
`

/**
 * Render one rail-segmentation study. `renderHeader` draws a segment's header
 * (the studies differ only here); `headerCss` carries that header's token-scoped
 * styles; `proto` scopes them to this study so several can render side by side.
 * The first segment is marked active (as if focus sits on its first tile).
 */
export function RailSegmentsScene({
  proto,
  headerCss,
  renderHeader,
}: {
  readonly proto: string
  readonly headerCss: string
  readonly renderHeader: (segment: RailSegment, active: boolean) => ReactNode
}) {
  return (
    <div
      data-shift-home
      data-rail-seg
      data-proto={proto}
      className="shift-cine intrinsic relative h-full w-full overflow-hidden"
    >
      <style>{`${BASE_CSS}${headerCss}`}</style>
      <ShiftCineBackdrop artUrl={FOCUSED_GAME?.wideArtUrl ?? ""} />
      <ShiftStatusBar time="4:24 PM" />
      <div className="shift-cine-stage">
        <div className="shift-cine-midrow">
          {FOCUSED_GAME ? (
            <ShiftCineHero game={FOCUSED_GAME} status={null} resuming />
          ) : null}
        </div>
        <ShiftCineLegend hints={HINTS} />
        <div className="shift-cine-rail">
          <div className="shift-cine-track">
            {RAIL_SEGMENTS.map((segment, si) => (
              <div
                key={segment.id}
                className="rail-seg"
                data-active={si === 0 || undefined}
              >
                {renderHeader(segment, si === 0)}
                <div className="rail-seg-tiles">
                  {segment.tiles.map(tile => (
                    <ShiftCineTile
                      key={tile.game.id}
                      index={tile.index}
                      title={tile.game.title}
                      artUrl={tile.game.tileArtUrl}
                      focused={tile.index === 0}
                      onFocus={() => undefined}
                      onActivate={() => undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
