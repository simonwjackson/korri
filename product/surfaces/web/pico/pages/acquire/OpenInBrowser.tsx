/**
 * pico surface. ATOMIC LAYER: page.
 * Non-final download that needs the browser. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { Badge } from "../../ui/atoms/Badge"
import { Btn } from "../../ui/atoms/Btn"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function OpenInBrowser() {
  return (
    <PicoData atom={picoAcquireTargetAtom} title="PICO ▸ DOWNLOAD">
      {target => (
        <ScreenShell
          title="PICO ▸ DOWNLOAD"
          hints={[
            { key: "a", label: "OPEN" },
            { key: "b", label: "CANCEL" },
          ]}
          className="center"
        >
          <Hero
            glyph="↗"
            glyphTone="info"
            title="OPEN IN BROWSER"
            message="this one won't fetch itself — the provider wants you to kick it off by hand. pop the page open, then hop back here."
          >
            <Badge tone="info">REQUIRES USER ACTION</Badge>
            <Btn kind="primary" state="selected">
              ↗ OPEN IN BROWSER
            </Btn>
            <code className="pcAcq-url">
              https://portmaster.games/get/{target.id}
            </code>
          </Hero>
        </ScreenShell>
      )}
    </PicoData>
  )
}
