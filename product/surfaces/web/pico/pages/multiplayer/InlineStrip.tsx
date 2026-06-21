/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Inline seat strip (no-hub placement). Reads `picoInlineStripAtom`.
 */
import { picoInlineStripAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { InlineSeatStrip } from "../../ui/organisms/InlineSeatStrip"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function InlineStrip() {
  return (
    <PicoData atom={picoInlineStripAtom} title="PICO ▸ HOME">
      {({ games, players }) => (
        <ScreenShell
          title="PICO ▸ HOME"
          hints={[
            { key: "a", label: "PLAY" },
            { key: "y", label: "INVITE" },
          ]}
          className="pad-0"
        >
          <InlineSeatStrip games={games} players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
