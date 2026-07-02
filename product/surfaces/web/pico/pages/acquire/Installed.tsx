/**
 * pico surface. ATOMIC LAYER: page.
 * Installed / ready to play. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { PicoIcon } from "../../PicoIcon"
import { PicoData } from "../../screens/PicoData"
import { Badge } from "../../ui/atoms/Badge"
import { Btn } from "../../ui/atoms/Btn"
import { Hero } from "../../ui/organisms/Hero"
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
            <Btn kind="primary" state="selected">
              <PicoIcon name="play" /> PLAY
            </Btn>
          </Hero>
        </ScreenShell>
      )}
    </PicoData>
  )
}
