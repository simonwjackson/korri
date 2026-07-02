import { DEV_GAME_MEDIA } from "../dev-game-media"
import type { ShiftGameDetailView } from "./shift-game-detail-view"

/**
 * Lab fixtures for the game-detail family: the real dev-media game projected
 * into the detail-view shape, in its two real action states — played (offers
 * Continue + New Game, favourited) and fresh (offers Play). Shared by the
 * page-level and molecule-level part catalogs so every detail part previews
 * against the same data.
 */
export function shiftDetailFixture(
  over: Partial<ShiftGameDetailView>,
): ShiftGameDetailView {
  const media = DEV_GAME_MEDIA[0]
  return {
    id: media?.id ?? "game",
    title: media?.title ?? "Game",
    artUrl: media?.gridUrl ?? "",
    ...(media?.genre ? { genre: media.genre } : {}),
    ...(media?.developer ? { developer: media.developer } : {}),
    ...over,
  }
}

export const SHIFT_DETAIL_PLAYED: ShiftGameDetailView = shiftDetailFixture({
  lastPlayedLabel: "2h ago",
  playtimeLabel: "12.0h",
  favorite: true,
})

export const SHIFT_DETAIL_FRESH: ShiftGameDetailView = shiftDetailFixture({})
