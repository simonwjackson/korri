/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Ready & countdown. Reads `picoPartySessionAtom`.
 */
import { picoPartySessionAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { CountdownStage } from "../../ui/organisms/CountdownStage"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Countdown() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ COUNTDOWN">
      {({ game, players }) => (
        <ScreenShell className="pad-0">
          <CountdownStage game={game} players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
