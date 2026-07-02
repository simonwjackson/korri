/**
 * pico surface. ATOMIC LAYER: page.
 *
 * The "woven in + reactive" home: hover/click a cart to focus it, Pixl gazes
 * toward it (and chirps), and selecting fires the launch ritual. Owns the
 * focus/launch state + sfx; composes ScreenShell + ReactiveStage.
 */
import { useState } from "react"
import { picoGamesAtom } from "../../data/pico-library-atoms"
import type { PicoGame } from "../../fixtures"
import { sfx } from "../../pico-sfx"
import { PicoData } from "../../screens/PicoData"
import {
  ReactiveStage,
  type ReactiveStageState,
} from "../../ui/organisms/ReactiveStage"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function ReactiveHome() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ HOME">
      {games => <ReactiveHomeBody allGames={games} />}
    </PicoData>
  )
}

function ReactiveHomeBody({
  allGames,
}: {
  readonly allGames: readonly PicoGame[]
}) {
  const games = allGames.slice(0, 5)
  const [focus, setFocus] = useState(2)
  const [launchState, setLaunchState] = useState<"idle" | "launching">("idle")
  const hero = games[focus]
  const mid = (games.length - 1) / 2
  const gaze = mid === 0 ? 0 : (focus - mid) / mid

  function pick(index: number) {
    if (index === focus) return
    setFocus(index)
    sfx.move()
  }
  function launch() {
    if (launchState === "launching") return
    sfx.launch()
    setLaunchState("launching")
    window.setTimeout(() => setLaunchState("idle"), 2200)
  }

  const stageState: ReactiveStageState =
    launchState === "launching" && hero
      ? { _tag: "Launching", hero }
      : { _tag: "Browsing", hero }

  return (
    <ScreenShell
      title="PICO ▸ HOME"
      hints={[
        { key: "a", label: "PLAY" },
        { key: "y", label: "INFO" },
        { key: "b", label: "BACK" },
      ]}
    >
      <ReactiveStage
        games={games}
        focus={focus}
        gaze={gaze}
        state={stageState}
        onPick={pick}
        onLaunch={launch}
      />
    </ScreenShell>
  )
}
