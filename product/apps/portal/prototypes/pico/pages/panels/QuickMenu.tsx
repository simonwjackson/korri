/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * PANELS — quick-menu / control-center push drawer (right). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { ControlCenter } from "../../ui/organisms/ControlCenter"
import { MiniHome } from "../../ui/organisms/MiniHome"
import { PanelScreen } from "../../ui/templates/PanelScreen"

export function QuickMenu() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ QUICK MENU">
      {games => (
        <PanelScreen
          title="PICO ▸ QUICK MENU"
          hints={[
            { key: "a", label: "SELECT" },
            { key: "b", label: "CLOSE" },
          ]}
          side="right"
          panelTitle="CONTROL CENTER"
          main={<MiniHome games={games} />}
          panel={<ControlCenter />}
        />
      )}
    </PicoData>
  )
}
