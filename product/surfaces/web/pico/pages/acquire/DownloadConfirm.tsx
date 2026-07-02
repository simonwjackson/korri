/**
 * pico surface. ATOMIC LAYER: page.
 * Download confirmation. Reads `picoDownloadConfirmAtom`.
 */
import { picoDownloadConfirmAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { DownloadConfirmCard } from "../../ui/organisms/DownloadConfirmCard"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DownloadConfirm() {
  return (
    <PicoData atom={picoDownloadConfirmAtom} title="PICO ▸ DOWNLOAD">
      {({ target, fexRelease, runtimes }) => (
        <ScreenShell
          title="PICO ▸ DOWNLOAD"
          hints={[
            { key: "a", label: "DOWNLOAD" },
            { key: "b", label: "CANCEL" },
          ]}
          className="center"
        >
          <DownloadConfirmCard
            target={target}
            size={fexRelease?.size ?? "104 MB"}
            runtime={runtimes[0]}
          />
        </ScreenShell>
      )}
    </PicoData>
  )
}
