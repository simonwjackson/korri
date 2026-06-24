import { useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useNavigate } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { VariantCartridgeShelf } from "../VariantCartridgeShelf"
import { PicoFallback } from "./PicoFallback"
import { picoGamesFromCatalog } from "./pico-catalog-view"

export function PicoHomeRoute() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const navigate = useNavigate()

  return AsyncResult.matchWithError(snapshot, {
    onInitial: () => <PicoFallback />,
    onError: () => <PicoFallback label="LIBRARY ERROR" />,
    onDefect: () => <PicoFallback label="LIBRARY ERROR" />,
    onSuccess: success => {
      const games = picoGamesFromCatalog(success.value.entries)
      if (games.length === 0) return <PicoFallback label="EMPTY" />
      return (
        <VariantCartridgeShelf
          games={games}
          onSelect={game =>
            navigate({ to: "/game/$id", params: { id: game.id } })
          }
        />
      )
    },
  })
}
