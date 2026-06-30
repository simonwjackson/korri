import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Option } from "effect"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "../catalog/ShiftCatalogStateRoot"
import { ShiftDetailSplit } from "../pages/ShiftDetailSplit"
import { ShiftHomeDefectBody } from "../pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "../pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "../pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "../pages/ShiftHomeLoadingBody"

export function ShiftGameDetailRoute() {
  const live = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  // Render non-Ready bodies too, so the route reflects whichever real catalog
  // source is mounted at the edge instead of falling through to a blank detail.
  const snapshot = live
  return (
    <ShiftCatalogStateRoot result={snapshot}>
      <ShiftHomeLoadingBody />
      <ShiftHomeLoadErrorBody onRetry={refreshSnapshot} />
      <ShiftHomeDefectBody />
      <ShiftHomeEmptyBody />
      <DetailReadyBody />
    </ShiftCatalogStateRoot>
  )
}

function DetailReadyBody() {
  const ready = useShiftCatalogCase("Ready")
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const launch = useLibraryLaunchController()

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => {
      const entry = games.find(game => game.id === params.id)
      if (!entry)
        return (
          <main
            data-shift-home
            className="intrinsic relative flex h-full w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
          >
            <p className="opacity-70">Game not found.</p>
          </main>
        )
      return (
        <ShiftDetailSplit
          game={{
            id: entry.id,
            title: getPlayableDisplayName(entry),
            artUrl: getPlayableImageUrl(entry) ?? "",
            ...(entry.metadata?.genre?.[0]
              ? { genre: entry.metadata.genre[0] }
              : {}),
            ...(entry.metadata?.developer
              ? { developer: entry.metadata.developer }
              : {}),
          }}
          onPlay={() => launch.start(entry)}
          onBack={() => navigate({ to: "/" })}
        />
      )
    },
  })
}
