/**
 * Shift molecule — poster tile art.
 *
 * The 1:1 cover image used for non-resume tiles in the home rail. Falls
 * back to the game's display name in muted ink when the fixture lacks
 * an image so the rail still reads correctly with sparse data.
 *
 * The fallback uses Tailwind utilities because tone, sizing, and
 * text-transform are layout / typography rather than identity-bearing
 * Shift voice. The `--shift-ink-faint` token keeps it inside Shift's
 * palette either way.
 */

import {
  getGameDisplayName,
  getGameImageUrl,
  type ResolvedGameRecord,
} from "@shared/fixtures/games/game"

export interface ShiftHomePosterTileProps {
  readonly game: ResolvedGameRecord
}

export function ShiftHomePosterTile({ game }: ShiftHomePosterTileProps) {
  const url = getGameImageUrl(game)
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-sm uppercase tracking-widest text-[color:var(--shift-ink-faint)]">
        {getGameDisplayName(game)}
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  )
}
