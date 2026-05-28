import { useAtomSet } from "@effect/atom-react"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  type LaunchController,
  type LaunchStartInput,
  type LaunchState,
  LaunchState as LaunchStateModel,
} from "./launch-state"
import { launchAtom } from "./library-atoms"

export function useLibraryLaunchController(): LaunchController {
  const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
  const [state, setState] = useState<LaunchState>(LaunchStateModel.idle)
  const stateRef = useRef<LaunchState>(LaunchStateModel.idle)
  const failedGameRef = useRef<LaunchStartInput | undefined>(undefined)

  stateRef.current = state

  const start = useCallback(
    (game: LaunchStartInput) => {
      console.log("[korri-launch] start fired", {
        id: game.id,
        hasSource: Boolean(game.source),
        sourceHostId: game.source?.hostId,
        sourceControlUrl: game.source?.controlUrl,
        sourceIsLocal: game.source?.isLocal,
        currentState: stateRef.current._tag,
      })
      if (LaunchStateModel.isLaunching(stateRef.current)) {
        console.log("[korri-launch] skipping; already launching")
        return
      }

      stateRef.current = LaunchStateModel.launching(game.id)
      setState(stateRef.current)
      void launch({ id: game.id, source: game.source }).then(exit => {
        console.log("[korri-launch] launch atom resolved", {
          id: game.id,
          exitTag: exit._tag,
          exit: exit._tag === "Success" ? exit.value : String(exit.cause),
        })
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
