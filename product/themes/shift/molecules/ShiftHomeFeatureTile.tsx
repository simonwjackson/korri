/**
 * Shift molecule — feature tile art.
 *
 * The wide landscape image that fills the resume target's tile in the
 * home rail. Prefer resolved game-assets art when present, and fall back
 * to deterministic Picsum landscape art only for sparse fixtures.
 *
 * The `shift-` prefix in the seed key is an opaque content key, not a
 * code dependency — it stays even though the rename from "sunlit" to
 * "shift" might suggest otherwise. Changing the prefix would change
 * which deterministic image picsum returns and silently invalidate
 * any visual review screenshots.
 */

import {
  getGameWideImageUrl,
  type ResolvedGameRecord,
} from "@platform/fixtures/games/game"

function featureArtUrl(id: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(`shift-${id}-wide`)}/1280/720`
}

export interface ShiftHomeFeatureTileProps {
  readonly game: ResolvedGameRecord
}

export function ShiftHomeFeatureTile({ game }: ShiftHomeFeatureTileProps) {
  const url = getGameWideImageUrl(game) ?? featureArtUrl(game.id)

  return (
    <img
      src={url}
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  )
}
