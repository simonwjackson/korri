/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Installed / ready to play. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { Badge, Btn, Hero, PicoIcon } from "../../screens/kit"
import { PicoData } from "../../screens/PicoData"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Installed() {
  return (
    <PicoData atom={picoAcquireTargetAtom} title="PICO ▸ INSTALL">
      {target => (
        <ScreenShell
          title="PICO ▸ INSTALL"
          hints={[
            { key: "a", label: "PLAY" },
            { key: "y", label: "OPTIONS" },
          ]}
          className="center"
        >
          <Hero
            glyph={<PicoIcon name="check" />}
            glyphTone="good"
            title="READY TO PLAY"
            message={`${target.title} is tucked in and ready — all set, go play! nothing launches on its own.`}
          >
            <Badge tone="good">INSTALLED</Badge>
            <Btn kind="primary" sel>
              <PicoIcon name="play" /> PLAY
            </Btn>
          </Hero>
        </ScreenShell>
      )}
    </PicoData>
  )
}
