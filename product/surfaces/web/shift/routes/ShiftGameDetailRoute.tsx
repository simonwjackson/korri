import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useInputAction } from "@platform/react/input/use-input-action"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Option } from "effect"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "../catalog/ShiftCatalogStateRoot"
import { ShiftGameDetailScreen } from "../pages/ShiftGameDetailScreen"
import { ShiftHomeDefectBody } from "../pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "../pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "../pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "../pages/ShiftHomeLoadingBody"
import { useShiftCatalogPreview } from "../shift-catalog-preview"

export function ShiftGameDetailRoute() {
  const live = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  // Same data pin the home consults, so a pinned coordinate addresses detail too.
  // Render the non-Ready bodies as well, so a pinned non-Ready coordinate shows
  // its real state instead of a blank route.
  const snapshot = useShiftCatalogPreview() ?? live
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

  useInputAction("back", () => navigate({ to: "/" }))

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
        <ShiftGameDetailScreen
          games={[
            {
              id: entry.id,
              title: getPlayableDisplayName(entry),
              artUrl: getPlayableImageUrl(entry) ?? "",
            },
          ]}
          onPlay={() => launch.start(entry)}
        />
      )
    },
  })
}
