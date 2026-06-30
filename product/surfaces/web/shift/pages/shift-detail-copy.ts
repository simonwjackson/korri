/**
 * Shift game detail — copy helpers (pure).
 *
 * The bits of detail copy the rebalance variants share: the primary-action verb
 * (Continue vs Play, decided by whether the game has been played) and a short
 * synopsis fallback when the source carries no description. Kept pure so the
 * three layouts read identically and the wording lives in one tested place.
 */
import type { ShiftGameDetailView } from "./shift-game-detail-view"

export function shiftDetailPlayLabel(game: ShiftGameDetailView): string {
  return game.lastPlayedLabel ? "Continue" : "Play"
}

export function shiftDetailSynopsis(game: ShiftGameDetailView): string {
  const genre = (game.genre ?? "game").toLowerCase()
  const developer = game.developer ?? "an independent studio"
  return `A ${genre} from ${developer}. Jump back into your last save, or start fresh — your call.`
}
