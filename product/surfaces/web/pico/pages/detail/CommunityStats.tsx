/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Community stats: plays / likes / score / difficulty for a game. Reads
 * `picoCommunityStatsAtom` and composes ScreenShell + DetailHead +
 * CommunityStatPanel.
 */
import { picoCommunityStatsAtom } from "../../data/pico-detail-atoms"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { Chip } from "../../ui/atoms/Chip"
import { DetailHead } from "../../ui/molecules/DetailHead"
import { CommunityStatPanel } from "../../ui/organisms/CommunityStatPanel"
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
              <div
                className="pcDet-chips"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetChips)}
              >
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
