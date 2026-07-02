/**
 * pico surface. ATOMIC LAYER: page.
 * PANELS — game quick-look push drawer (right). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { MiniHome } from "../../ui/organisms/MiniHome"
import { QuickLook } from "../../ui/organisms/QuickLook"
import { PanelScreen } from "../../ui/templates/PanelScreen"

export function GameQuickLook() {
  const focus = 2
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ HOME">
      {games => {
        const game = games[focus] ?? games[0]
        return (
          <PanelScreen
            title="PICO ▸ HOME"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "INFO" },
              { key: "b", label: "CLOSE" },
            ]}
            side="right"
            panelTitle="QUICK LOOK"
            main={<MiniHome games={games} focusIndex={focus} />}
            panel={game ? <QuickLook game={game} /> : null}
          />
        )
      }}
    </PicoData>
  )
}
