import { useAtomSet } from "@effect/atom-react"
import type { GameRecord } from "@shared/fixtures/games/game"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  type LaunchController,
  type LaunchState,
  LaunchState as LaunchStateModel,
} from "./launch-state"
import { launchAtom } from "./library-atoms"

export function useLibraryLaunchController(): LaunchController {
  const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
  const [state, setState] = useState<LaunchState>(LaunchStateModel.idle)
  const stateRef = useRef<LaunchState>(LaunchStateModel.idle)
  const failedGameRef = useRef<GameRecord | undefined>(undefined)

  stateRef.current = state

  const start = useCallback(
    (game: GameRecord) => {
      if (LaunchStateModel.isLaunching(stateRef.current)) return

      stateRef.current = LaunchStateModel.launching(game.id)
      setState(stateRef.current)
      void launch(game.id).then(exit => {
        const next = LaunchStateModel.fromExit(game.id, exit)
        if (next._tag === "Failed" || next._tag === "Defect") {
          failedGameRef.current = game
        } else {
          failedGameRef.current = undefined
        }
        stateRef.current = next
        setState(next)
      })
    },
    [launch],
  )

  const retry = useCallback(() => {
    const failedGame = failedGameRef.current
    if (!failedGame) return
    start(failedGame)
  }, [start])

  return useMemo(() => ({ state, start, retry }), [state, start, retry])
}
