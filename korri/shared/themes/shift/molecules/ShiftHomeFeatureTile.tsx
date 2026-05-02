/**
 * Shift molecule — feature tile art.
 *
 * The wide landscape image that fills the resume target's tile in the
 * home rail. Cropping the fixtures' square cover art to 16:9 would
 * defeat the cinematic-landscape character that this tile depends on,
 * so we derive a deterministic but distinct landscape source per
 * fixture id from picsum.photos.
 *
 * The `shift-` prefix in the seed key is an opaque content key, not a
 * code dependency — it stays even though the rename from "sunlit" to
 * "shift" might suggest otherwise. Changing the prefix would change
 * which deterministic image picsum returns and silently invalidate
 * any visual review screenshots.
 */

import type { GameRecord } from "@shared/fixtures/games/game"

function featureArtUrl(id: string): string {
  return `https://picsum.photos/seed/shift-${id}-wide/1280/720`
}

export interface ShiftHomeFeatureTileProps {
  readonly game: GameRecord
}

export function ShiftHomeFeatureTile({ game }: ShiftHomeFeatureTileProps) {
  return (
    <img
      src={featureArtUrl(game.id)}
      alt=""
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  )
}
