// Exploration (not final): Home · Up Next — navigable.
//
// One live home that carries both freshness treatments so they can be evaluated
// in motion (navigate the rail with arrows / a gamepad):
//   • Surprise — a trailing rail affordance (the Library tile's twin); focus it
//     to see the "Feeling lucky?" hero.
//   • Fresh markers — recommended picks wear a "Fresh" tile marker, and their
//     hero leads with a "Fresh pick" reason chip; focus one vs a recent game to
//     feel the difference.
// Renders the REAL ShiftCinematicHome, so this is the actual production home —
// the lab frames it intrinsically (template layer → data-fill). Delete this file
// to drop the exploration.
import { SHIFT_CINEMATIC_GAMES } from "./config"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "./pages/ShiftCinematicHome"

const AVATAR = "https://i.pravatar.cc/96?u=korri-shift-user"
const UP_NEXT_CAP = 12

/** Blend recent play + committed favorites into one compact, de-duplicated
 * Up Next set (recent leads, favorites fill), then tag the picks that are
 * neither recent nor favorite as "fresh" so the discovery treatment has
 * something to mark. */
function curateUpNext(
  games: readonly ShiftCinematicGame[],
): readonly ShiftCinematicGame[] {
  const recents = games.filter(game => game.lastPlayedLabel)
  const favorites = games.filter(game => game.favorite)
  const seen = new Set<string>()
  const ordered: ShiftCinematicGame[] = []
  for (const game of [...recents, ...favorites]) {
    if (seen.has(game.id)) continue
    seen.add(game.id)
    ordered.push(game)
  }
  const upNext = ordered.slice(0, UP_NEXT_CAP - 1)
  const fresh = games.find(
    game => !game.lastPlayedLabel && !game.favorite && !seen.has(game.id),
  )
  return fresh ? [...upNext, { ...fresh, fresh: true }] : upNext
}

export default {
  name: "Home · Up Next (navigable)",
  note: "exploration · surprise + fresh",
  render: () => (
    <ShiftCinematicHome
      games={curateUpNext(SHIFT_CINEMATIC_GAMES)}
      time="4:24 PM"
      avatarSrc={AVATAR}
      onSurprise={() => undefined}
      onOpenLibrary={() => undefined}
    />
  ),
}
