/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Non-final download that needs the browser. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { Badge, Btn, Hero } from "../../screens/kit"
import { PicoData } from "../../screens/PicoData"
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
            <Btn kind="primary" sel>
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
