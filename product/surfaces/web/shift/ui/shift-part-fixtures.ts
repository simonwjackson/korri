import { DEV_GAME_MEDIA } from "../dev-game-media"
import type { ShiftCinematicGame } from "../pages/ShiftCinematicHome"

/** Lab fixtures: the real dev-media games projected into the cinematic-home
 * shape, so decomposed Shift parts preview against the same data the Home uses.
 * The first entry carries resume/playtime/favourite metadata for hero previews. */
export const SHIFT_PART_GAMES: readonly ShiftCinematicGame[] =
  DEV_GAME_MEDIA.map((media, index) => ({
    id: media.id,
    title: media.title,
    tileArtUrl: media.gridUrl,
    wideArtUrl: media.heroUrl,
    genre: media.genre,
    developer: media.developer,
    lastPlayedLabel: index === 0 ? "3h ago" : undefined,
    playtimeLabel: index === 0 ? "12.4h" : undefined,
    favorite: index === 0,
  }))
