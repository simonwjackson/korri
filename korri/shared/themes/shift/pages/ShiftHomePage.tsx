import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { libraryItemsAtom } from "@shared/library/library-atoms"
import { LibraryListStateRoot } from "@shared/library/library-list-state-root"
import { useLibraryLaunchController } from "@shared/library/use-library-launch-controller"
import { ShiftHomeDefectBody } from "./ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "./ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "./ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "./ShiftHomeLoadingBody"
import { ShiftHomeReadyBody } from "./ShiftHomeReadyBody"

export function ShiftHomePage() {
  const items = useAtomValue(libraryItemsAtom)
  const refreshItems = useAtomRefresh(libraryItemsAtom)
  const launch = useLibraryLaunchController()

  return (
    <LibraryListStateRoot result={items}>
      <ShiftHomeLoadingBody />
      <ShiftHomeLoadErrorBody onRetry={refreshItems} />
      <ShiftHomeDefectBody />
      <ShiftHomeEmptyBody />
      <ShiftHomeReadyBody launch={launch} />
    </LibraryListStateRoot>
  )
}
