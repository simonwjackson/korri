// Exploration (not final): Rail segmentation · Headers.
//
// Instead of one flat A–Z-ish rail, the rail is grouped into labeled sections
// (Continue / Favorites / Fresh), each with a small caption header above its
// tiles; the section you're in lights its label in the accent. A static still to
// judge the *look* of segmentation — composed from the real ShiftCineTile +
// tokens, with the new segment bits as token-scoped styles so production is
// untouched. Delete this file to drop the exploration.
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

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"

const recents = SHIFT_CINEMATIC_GAMES.filter(game => game.lastPlayedLabel)
const favorites = SHIFT_CINEMATIC_GAMES.filter(
  game => game.favorite && !game.lastPlayedLabel,
)
const freshPicks = SHIFT_CINEMATIC_GAMES.filter(
  game => !game.lastPlayedLabel && !game.favorite,
)

interface SegmentTile {
  readonly game: ShiftCinematicGame
  readonly index: number
}
interface Segment {
  readonly id: string
  readonly label: string
  readonly tiles: readonly SegmentTile[]
}

const SEGMENTS: readonly Segment[] = (() => {
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

const FOCUSED = SEGMENTS[0]?.tiles[0]?.game ?? SHIFT_CINEMATIC_GAMES[0]

const HINTS: readonly ShiftCineHintSpec[] = [
  { glyph: "A", label: "Play", primary: true },
  { glyph: "X", label: "Options" },
  { glyph: "Y", label: "Favorite" },
]

// Segment scaffolding: a caption header above each group, the active group's
// label in the accent. Token-only; scoped to this take via data-proto.
const css = `
[data-proto="rail-seg-headers"] .shift-cine-track {
  align-items: flex-end;
  gap: calc(var(--cine-tile) * 0.44);
}
[data-proto="rail-seg-headers"] .rail-seg {
  display: flex;
  flex-direction: column;
  gap: var(--shift-space-2);
}
[data-proto="rail-seg-headers"] .rail-seg-label {
  padding-left: var(--shift-space-1);
  font-size: var(--shift-text-fine);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--shift-ink-dim);
}
[data-proto="rail-seg-headers"] .rail-seg[data-active] .rail-seg-label {
  color: var(--shift-accent);
}
[data-proto="rail-seg-headers"] .rail-seg-tiles {
  display: flex;
  gap: var(--shift-space-3);
  align-items: flex-end;
}
`

export default {
  name: "Rail segmentation · Headers",
  note: "exploration · section captions",
  render: () => (
    <div
      data-shift-home
      data-proto="rail-seg-headers"
      className="shift-cine intrinsic relative h-full w-full overflow-hidden"
    >
      <style>{css}</style>
      <ShiftCineBackdrop artUrl={FOCUSED?.wideArtUrl ?? ""} />
      <ShiftStatusBar time="4:24 PM" avatarSrc={AVATAR} />
      <div className="shift-cine-stage">
        <div className="shift-cine-midrow">
          {FOCUSED ? (
            <ShiftCineHero game={FOCUSED} status={null} resuming />
          ) : null}
        </div>
        <ShiftCineLegend hints={HINTS} />
        <div className="shift-cine-rail">
          <div className="shift-cine-track">
            {SEGMENTS.map((segment, si) => (
              <div
                key={segment.id}
                className="rail-seg"
                data-active={si === 0 || undefined}
              >
                <div className="rail-seg-label">{segment.label}</div>
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
  ),
}
