/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Store / discovery. Reads `picoStoreItemsAtom`.
 */
import { picoStoreItemsAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { StoreView } from "../../ui/organisms/StoreView"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Store() {
  return (
    <PicoData atom={picoStoreItemsAtom} title="PICO ▸ STORE">
      {storeItems => (
        <ScreenShell
          title="PICO ▸ STORE"
          hints={[
            { key: "a", label: "BROWSE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <StoreView items={storeItems} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
