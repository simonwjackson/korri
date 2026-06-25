/**
 * Shift molecule — feature tile art.
 *
 * The wide landscape image that fills the resume target's tile in the
 * home rail. Prefer resolved playable media art when present, and fall back
 * to deterministic Picsum landscape art only for sparse fixtures.
 */

import {
  asPlayableLibraryEntry,
  type PlayableLibraryInput,
} from "@platform/library/playable-library"
import { getPlayableWideImageUrl } from "@platform/library/playable-library-ui"

function featureArtUrl(id: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(`shift-${id}-wide`)}/1280/720`
}

export interface ShiftHomeFeatureTileProps {
  readonly game: PlayableLibraryInput
}

export function ShiftHomeFeatureTile({ game }: ShiftHomeFeatureTileProps) {
  const playable = asPlayableLibraryEntry(game)
  const url = getPlayableWideImageUrl(playable) ?? featureArtUrl(playable.id)

  return (
    <img
      src={url}
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  )
}
