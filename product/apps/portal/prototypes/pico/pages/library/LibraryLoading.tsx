/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Library loading state. Seeds the `loading-forever` behavior layer so `list()`
 * never resolves and the AsyncResult stays waiting — rendering the loading hero
 * via PicoData's `waiting` slot (no bespoke state prop).
 */
import {
  picoGamesAtom,
  picoLibraryLayerAtom,
} from "../../data/pico-library-atoms"
import { makePicoLibraryLayer } from "../../data/pico-library-service"
import { PicoData } from "../../screens/PicoData"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LibraryLoading() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("loading-forever")]]}
      waiting={() => (
        <ScreenShell title="PICO ▸ LIBRARY" className="center">
          <Hero
            spinner
            title="LOADING LIBRARY…"
            message="waking up the carts…"
          />
        </ScreenShell>
      )}
    >
      {() => null}
    </PicoData>
  )
}
