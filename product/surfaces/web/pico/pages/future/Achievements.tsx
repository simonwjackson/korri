/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Achievements. Reads `picoAchievementsAtom`.
 */
import { picoAchievementsAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { AchievementList } from "../../ui/organisms/AchievementList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Achievements() {
  return (
    <PicoData atom={picoAchievementsAtom} title="PICO ▸ TROPHIES">
      {achievements => (
        <ScreenShell
          title="PICO ▸ TROPHIES"
          hints={[
            { key: "a", label: "DETAILS" },
            { key: "b", label: "BACK" },
          ]}
        >
          <AchievementList achievements={achievements} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
