import { useAtomSet } from "@effect/atom-react"
import {
  type LaunchController,
  type LaunchStartInput,
  type LaunchState,
  LaunchState as LaunchStateModel,
  releaseChoiceForLaunch,
} from "@platform/library/launch-state"
import { useCallback, useMemo, useRef, useState } from "react"
import { launchAtom } from "./library-atoms"

export function useLibraryLaunchController(): LaunchController {
  const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
  const [state, setState] = useState<LaunchState>(LaunchStateModel.idle)
  const stateRef = useRef<LaunchState>(LaunchStateModel.idle)
  const failedGameRef = useRef<LaunchStartInput | undefined>(undefined)

  stateRef.current = state

  const start = useCallback(
    (game: LaunchStartInput) => {
      if (LaunchStateModel.isLaunching(stateRef.current)) return

      const releaseChoice = releaseChoiceForLaunch(game, game.releaseId)
      if (releaseChoice._tag === "ReleaseRequired") {
        const next = LaunchStateModel.releaseSelectionRequired(
          game.id,
          releaseChoice.releaseIds,
        )
        failedGameRef.current = undefined
        stateRef.current = next
        setState(next)
        return
      }
      if (releaseChoice._tag === "NoLaunchableRelease") {
        const next = LaunchStateModel.unavailable(game.id)
        failedGameRef.current = undefined
        stateRef.current = next
        setState(next)
        return
      }
      if (releaseChoice._tag === "NotLaunchable") {
        const next = LaunchStateModel.unavailable(
          game.id,
          releaseChoice.releaseId,
        )
        failedGameRef.current = undefined
        stateRef.current = next
        setState(next)
        return
      }

      stateRef.current = LaunchStateModel.launching(game.id)
      setState(stateRef.current)
      void launch({
        id: game.id,
        releaseId: releaseChoice.releaseId,
        source: game.source,
        launchAlternatives: game.launchAlternatives,
      }).then(exit => {
        const next = LaunchStateModel.fromExit(game.id, exit)
        if (next._tag === "Failed" || next._tag === "Defect") {
          failedGameRef.current = {
            ...game,
            releaseId: releaseChoice.releaseId,
          }
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
