/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Library load-error state. Seeds the `fail-list` behavior layer; `list()` fails
 * with PicoLibraryError and PicoData's `error` slot renders the alert hero.
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

export function LibraryError() {
  return (
    <PicoData
      atom={picoGamesAtom}
      seed={[[picoLibraryLayerAtom, makePicoLibraryLayer("fail-list")]]}
      error={() => (
        <ScreenShell
          tone="alert"
          title="PICO ▸ LIBRARY"
          hints={[
            { key: "a", label: "RETRY" },
            { key: "b", label: "BACK" },
          ]}
          className="center"
        >
          <Hero
            glyph="⚠"
            glyphTone="bad"
            title="COULD NOT LOAD LIBRARY"
            message="couldn't find your stash — check the host's plugged in and give it another go?"
          >
            <Btn kind="primary">
              <PicoIcon name="restart" /> RETRY
            </Btn>
          </Hero>
        </ScreenShell>
      )}
    >
      {() => null}
    </PicoData>
  )
}
