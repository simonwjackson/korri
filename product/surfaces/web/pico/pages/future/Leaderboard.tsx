/**
 * pico surface. ATOMIC LAYER: page.
 * Leaderboards. Reads `picoScoresAtom`.
 */
import { picoScoresAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { LeaderboardTable } from "../../ui/organisms/LeaderboardTable"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Leaderboard() {
  return (
    <PicoData atom={picoScoresAtom} title="PICO ▸ RANKS">
      {scores => (
        <ScreenShell
          title="PICO ▸ RANKS"
          hints={[
            { key: "a", label: "VIEW" },
            { key: "y", label: "SCOPE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <LeaderboardTable scores={scores} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
