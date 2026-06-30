import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  getPlayableDisplayName,
  getPlayableImageUrl,
} from "@platform/library/playable-library-ui"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useOptionalDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
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

export function ShiftCompanionRoute() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)

  return (
    <ShiftCatalogStateRoot result={snapshot}>
      <ShiftHomeLoadingBody />
      <ShiftHomeLoadErrorBody onRetry={refreshSnapshot} />
      <ShiftHomeDefectBody />
      <ShiftHomeEmptyBody />
      <CompanionReadyBody />
    </ShiftCatalogStateRoot>
  )
}

function CompanionReadyBody() {
  const ready = useShiftCatalogCase("Ready")
  const selectedGameId = useOptionalDualScreenSession()?.selectedGameId ?? null
  const launch = useLibraryLaunchController()

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => {
      if (!selectedGameId)
        return (
          <CompanionMessage>Waiting for primary selection.</CompanionMessage>
        )
      const entry = games.find(game => game.id === selectedGameId)
      if (!entry) return <CompanionMessage>Game not found.</CompanionMessage>
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
        />
      )
    },
  })
}

function CompanionMessage({ children }: { readonly children: string }) {
  return (
    <main
      data-shift-home
      className="intrinsic relative flex h-full w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
    >
      <p className="opacity-70">{children}</p>
    </main>
  )
}
