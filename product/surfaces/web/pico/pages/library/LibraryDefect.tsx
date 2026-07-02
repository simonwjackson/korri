/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Library defect state. Seeds the `defect` behavior layer; `list()` dies and
 * PicoData's `defect` slot renders the unrecoverable hero.
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

export function LibraryDefect() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("defect")]]}
      defect={() => (
        <ScreenShell
          tone="alert"
          title="PICO ▸ LIBRARY"
          hints={[{ key: "a", label: "RESTART" }]}
          className="center"
        >
          <Hero
            glyph={<PicoIcon name="close" />}
            glyphTone="bad"
            title="UNEXPECTED DEFECT"
            message="somethin' glitched out drawing the library. blow on the cartridge and restart?"
          >
            <Btn kind="primary">
              <PicoIcon name="restart" /> RESTART KORRI
            </Btn>
          </Hero>
        </ScreenShell>
      )}
    >
      {() => null}
    </PicoData>
  )
}
