/**
 * pico surface. ATOMIC LAYER: page.
 * PANELS — filters & collections push drawer (left). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { FiltersPanel } from "../../ui/organisms/FiltersPanel"
import { MiniHome } from "../../ui/organisms/MiniHome"
import { PanelScreen } from "../../ui/templates/PanelScreen"

export function Filters() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ LIBRARY">
      {games => (
        <PanelScreen
          title="PICO ▸ LIBRARY"
          hints={[
            { key: "a", label: "APPLY" },
            { key: "b", label: "CLOSE" },
          ]}
          side="left"
          panelTitle="FILTERS"
          main={<MiniHome games={games} />}
          panel={<FiltersPanel />}
        />
      )}
    </PicoData>
  )
}
