/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * PANELS — friends / party rail push drawer (right). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { FriendsPanel } from "../../ui/organisms/FriendsPanel"
import { MiniHome } from "../../ui/organisms/MiniHome"
import { PanelScreen } from "../../ui/templates/PanelScreen"

export function Friends() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ HOME">
      {games => (
        <PanelScreen
          title="PICO ▸ HOME"
          hints={[
            { key: "a", label: "JOIN" },
            { key: "b", label: "CLOSE" },
          ]}
          side="right"
          panelTitle="FRIENDS"
          main={<MiniHome games={games} />}
          panel={<FriendsPanel />}
        />
      )}
    </PicoData>
  )
}
