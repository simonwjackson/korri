import { useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useInputAction } from "@platform/react/input/use-input-action"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { VariantGameDetail } from "../VariantGameDetail"
import { PicoFallback } from "./PicoFallback"
import { picoGameFromCatalog } from "./pico-catalog-view"

export function PicoGameDetailRoute() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const launch = useLibraryLaunchController()

  useInputAction("back", () => navigate({ to: "/" }))

  return AsyncResult.matchWithError(snapshot, {
    onInitial: () => <PicoFallback />,
    onError: () => <PicoFallback label="LIBRARY ERROR" />,
    onDefect: () => <PicoFallback label="LIBRARY ERROR" />,
    onSuccess: success => {
      const entry = success.value.entries.find(game => game.id === params.id)
      if (!entry) return <PicoFallback label="NOT FOUND" />
      return (
        <VariantGameDetail
          games={[picoGameFromCatalog(entry)]}
          onPlay={() => launch.start(entry)}
          onBack={() => navigate({ to: "/" })}
        />
      )
    },
  })
}
