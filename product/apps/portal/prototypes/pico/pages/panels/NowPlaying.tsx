/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * PANELS — now-playing session dock push drawer (right). Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { RunningGame } from "../../ui/organisms/RunningGame"
import { SessionDock } from "../../ui/organisms/SessionDock"
import { PanelScreen } from "../../ui/templates/PanelScreen"

export function NowPlaying() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ PLAYING">
      {games => {
        const game = games[4] ?? games[0]
        return (
          <PanelScreen
            title="PICO ▸ PLAYING"
            hints={[
              { key: "a", label: "RESUME" },
              { key: "b", label: "QUIT" },
            ]}
            side="right"
            panelTitle="SESSION"
            main={game ? <RunningGame game={game} /> : null}
            panel={<SessionDock />}
          />
        )
      }}
    </PicoData>
  )
}
