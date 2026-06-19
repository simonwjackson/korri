/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Community stats: plays / likes / score / difficulty for a game. Reads
 * `picoCommunityStatsAtom` and composes ScreenShell + DetailHead +
 * CommunityStatPanel.
 */
import { picoCommunityStatsAtom } from "../../data/pico-detail-atoms"
import { Chip } from "../../screens/kit"
import { PicoData } from "../../screens/PicoData"
import { CommunityStatPanel } from "../../ui/organisms/CommunityStatPanel"
import { DetailHead } from "../../ui/molecules/DetailHead"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function CommunityStats() {
  return (
    <PicoData atom={picoCommunityStatsAtom} title="PICO ▸ GAME">
      {({ game, stats }) => {
        if (!game) return null
        return (
          <ScreenShell
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "b", label: "BACK" },
            ]}
          >
            <DetailHead game={game} tags="COMMUNITY · PORTMASTER">
              <div className="pcDet-chips">
                <Chip>FANGAME</Chip>
                <Chip>CO-OP</Chip>
                <Chip>CONTROLLER</Chip>
              </div>
            </DetailHead>
            <CommunityStatPanel stats={stats} />
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
