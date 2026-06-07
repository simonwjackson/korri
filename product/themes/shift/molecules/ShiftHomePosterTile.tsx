/**
 * Shift molecule — poster tile art.
 *
 * The 1:1 cover image used for non-resume tiles in the home rail. Falls
 * back to the playable display name in muted ink when the entry lacks
 * an image so the rail still reads correctly with sparse data.
 */

import type { PlayableLibraryInput } from "@platform/library/playable-library"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"

export interface ShiftHomePosterTileProps {
  readonly game: PlayableLibraryInput
}

export function ShiftHomePosterTile({ game }: ShiftHomePosterTileProps) {
  const url = getPlayableImageUrl(game)
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-center text-sm uppercase tracking-widest text-[color:var(--shift-ink-faint)]">
        {getPlayableDisplayName(game)}
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
