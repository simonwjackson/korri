/**
 * Cinematic Home template catalog entry — the Home LAYOUT (backdrop, status
 * bar, hero, segmented rail, legend arranged around a `games` slot). The Home
 * *page* (`ShiftHome.page.part`) is this template bound to the live catalog Data
 * and foreground state machines; here it renders from curated, sectioned
 * fixtures that mirror production (Recent / Random + Library & Store).
 */
import { SHIFT_CINEMATIC_GAMES } from "./config"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "./pages/ShiftCinematicHome"
import { SHIFT_DESIGN_PARTS } from "./shift-design-parts"

const RECENT = SHIFT_CINEMATIC_GAMES.filter(game => game.lastPlayedLabel).slice(
  0,
  6,
)
const RECENT_IDS = new Set(RECENT.map(game => game.id))
const RANDOM = SHIFT_CINEMATIC_GAMES.find(game => !RECENT_IDS.has(game.id))
const SECTIONED_GAMES: readonly ShiftCinematicGame[] = [
  ...RECENT.map(game => ({ ...game, section: "Recent" })),
  ...(RANDOM ? [{ ...RANDOM, section: "Random" }] : []),
]

export default {
  designPartId: SHIFT_DESIGN_PARTS.homeTemplate.id,
  name: "Cinematic Home",
  note: "Template",
  surface: true,
  render: () => (
    <ShiftCinematicHome
      games={SECTIONED_GAMES}
      time="4:24 PM"
      onOpenLibrary={() => undefined}
      onOpenStore={() => undefined}
    />
  ),
}
