import { picoGames, picoRecent } from "../../fixtures"
import type { StorySpec } from "../../story-spec"
import { type Shelf, ShelfGrid } from "./ShelfGrid"

const shelves: readonly Shelf[] = [
  { title: "CONTINUE", games: picoRecent.slice(0, 6) },
  { title: "FRESH DROPS", games: picoGames.slice(8, 14) },
  { title: "PICK UP & PLAY", games: picoGames.slice(1, 7) },
].filter(shelf => shelf.games.length > 0)

export default {
  render: () => <ShelfGrid shelves={shelves} />,
} satisfies StorySpec
