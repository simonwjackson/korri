import { useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { App } from "../app"
import { boxbusterGamesFromCatalog } from "../boxbuster-catalog-view"
import type { Game } from "../steamgriddb"

export interface BoxbusterRouteState {
  readonly games: readonly Game[]
  readonly playing: Game | null
}

export function boxbusterRouteState(
  games: readonly Game[],
  gameId: string | undefined,
): BoxbusterRouteState {
  return {
    games,
    playing: gameId ? (games.find(game => game.id === gameId) ?? null) : null,
  }
}

export function boxbusterPathForPlay(
  game: Game | null,
):
  | { readonly to: "/" }
  | { readonly to: "/game/$id"; readonly params: { readonly id: string } } {
  return game ? { to: "/game/$id", params: { id: game.id } } : { to: "/" }
}

export function BoxbusterStoreRoute() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const params = useParams({ strict: false })
  const navigate = useNavigate()

  return AsyncResult.matchWithError(snapshot, {
    onInitial: () => <App embedded games={[]} playing={null} />,
    onError: () => <App embedded games={[]} playing={null} />,
    onDefect: () => <App embedded games={[]} playing={null} />,
    onSuccess: success => {
      const state = boxbusterRouteState(
        boxbusterGamesFromCatalog(success.value.entries),
        params.id,
      )
      return (
        <App
          embedded
          games={state.games}
          playing={state.playing}
          onPlay={game => navigate(boxbusterPathForPlay(game))}
        />
      )
    },
  })
}
