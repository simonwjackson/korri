/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Library empty state. Seeds the `empty` behavior layer; `list()` succeeds with
 * no carts and the success branch renders the empty hero.
 */
import {
  picoGamesAtom,
  picoLibraryLayerAtom,
} from "../../data/pico-library-atoms"
import { makePicoLibraryLayer } from "../../data/pico-library-service"
import { PicoIcon } from "../../PicoIcon"
import { PicoData } from "../../screens/PicoData"
import { Btn } from "../../ui/atoms/Btn"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LibraryEmpty() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("empty")]]}
    >
      {() => (
        <ScreenShell
          title="PICO ▸ LIBRARY"
          hints={[{ key: "a", label: "ADD" }]}
          className="center"
        >
          <Hero
            glyph="◰"
            glyphTone="info"
            title="NO GAMES YET"
            message="no carts on the shelf yet — add a source and Korri will go dig some up."
          >
            <Btn kind="primary">
              <PicoIcon name="plus" /> ADD A SOURCE
            </Btn>
          </Hero>
        </ScreenShell>
      )}
    </PicoData>
  )
}
