import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import { ShiftCatalogStateRoot } from "../catalog/ShiftCatalogStateRoot"
import { ShiftHomeDefectBody } from "./ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "./ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "./ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "./ShiftHomeLoadingBody"
import { ShiftHomeReadyBody } from "./ShiftHomeReadyBody"

export function ShiftHomePage() {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  const launch = useLibraryLaunchController()

  // Surface frame: owns the "fill the screen" height (100vh in production)
  // so the [data-shift-home] surface inside can be a self-measuring
  // container-type:size box (h-full). Embedded contexts (device-lab,
  // dual-screen) supply their own box and the surface fills that instead.
  return (
    <div data-shift-home-frame>
      <ShiftCatalogStateRoot result={snapshot}>
        <ShiftHomeLoadingBody />
        <ShiftHomeLoadErrorBody onRetry={refreshSnapshot} />
        <ShiftHomeDefectBody />
        <ShiftHomeEmptyBody />
        <ShiftHomeReadyBody launch={launch} />
      </ShiftCatalogStateRoot>
    </div>
  )
}
