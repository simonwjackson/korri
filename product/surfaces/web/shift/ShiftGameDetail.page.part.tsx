/**
 * Shift Game Detail — action states as a part-catalog state family.
 *
 * The detail screen's primary action has two real states driven by play history:
 * a played game offers Continue (+ New Game), a fresh one offers Play. Each is a
 * fixture-backed variant so the dev-lab States panel can switch between them
 * while inspecting the part. Static (no backend, no router).
 */
import type { Story } from "@tools/theme-workshop"
import { DEV_GAME_MEDIA } from "./dev-game-media"
import { ShiftDetailSplit } from "./pages/ShiftDetailSplit"
import type { ShiftGameDetailView } from "./pages/shift-game-detail-view"

function detailFixture(
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

const played = detailFixture({
  lastPlayedLabel: "2h ago",
  playtimeLabel: "12.0h",
  favorite: true,
})
const fresh = detailFixture({})

export const ShiftGameDetailStates = [
  {
    id: "shift-game-detail-continue",
    layer: "page" as const,
    name: "Game Detail",
    note: "Action states",
    surface: true,
    state: "Continue",
    render: () => <ShiftDetailSplit game={played} />,
  },
  {
    id: "shift-game-detail-play",
    layer: "page" as const,
    name: "Game Detail",
    note: "Action states",
    surface: true,
    state: "Play",
    render: () => <ShiftDetailSplit game={fresh} />,
  },
] satisfies readonly Story[]
