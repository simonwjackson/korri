import { useAtomValue } from "@effect/atom-react"
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
import { useShiftCatalogPreview } from "../shift-catalog-preview"

export function ShiftGameDetailRoute() {
  const live = useAtomValue(catalogSnapshotAtom)
  // Same data pin the home consults, so a pinned coordinate addresses detail too.
  const snapshot = useShiftCatalogPreview() ?? live
  return (
    <ShiftCatalogStateRoot result={snapshot}>
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
      if (!entry) return null
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
