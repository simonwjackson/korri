/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Streaming (moonlight) live overlay. Reads `picoHeroAtom`; Modal shell.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { Modal } from "../../screens/kit"
import { PicoData } from "../../screens/PicoData"
import { StreamPanel } from "../../ui/organisms/StreamPanel"

export function StreamOverlay() {
  return (
    <PicoData atom={picoHeroAtom} title="STREAMING">
      {hero => (
        <Modal
          title="STREAMING"
          hints={[
            { key: "a", label: "PAUSE" },
            { key: "b", label: "RESUME" },
            { key: "y", label: "QUIT" },
          ]}
        >
          <StreamPanel hero={hero} />
        </Modal>
      )}
    </PicoData>
  )
}
