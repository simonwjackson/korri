import { describe, expect, it } from "bun:test"
import { useAtomSet } from "@effect/atom-react"
import { games } from "@shared/fixtures/games/games"
import { makeInMemoryLauncherLayer } from "@shared/library/launcher-layer-memory"
import {
  loadingForeverLibrarySourceLayer,
  makeInMemoryLibrarySourceLayer,
} from "@shared/library/library-source-layer-memory"
import { act, renderHook, waitFor } from "@testing-library/react"
import { type ReactNode, useLayoutEffect } from "react"
import { launcherLayerAtom, librarySourceLayerAtom } from "./library-atoms"
import { useLibraryLaunchController } from "./use-library-launch-controller"

const game = games[0]

function withLayers({
  exitCode,
  failureKind,
}: {
  readonly exitCode?: number
  readonly failureKind?: "moonlight-failed"
} = {}) {
  return function LibraryLaunchTestRoot({
    children,
  }: {
    readonly children: ReactNode
  }) {
    const setSourceLayer = useAtomSet(librarySourceLayerAtom)
    const setLauncherLayer = useAtomSet(launcherLayerAtom)

    useLayoutEffect(() => {
      setSourceLayer(makeInMemoryLibrarySourceLayer({ games: [game] }))
      setLauncherLayer(
        makeInMemoryLauncherLayer({
          behavior:
            exitCode === undefined
              ? { kind: "succeed", delayMs: 1 }
              : { kind: "fail", exitCode, failureKind, delayMs: 1 },
        }),
      )
      return () => {
        setSourceLayer(loadingForeverLibrarySourceLayer)
        setLauncherLayer(
          makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
        )
      }
    }, [setSourceLayer, setLauncherLayer, exitCode, failureKind])

    return <>{children}</>
  }
}

describe("useLibraryLaunchController", () => {
  it("transitions Idle → Launching → Launched", async () => {
    const { result } = renderHook(() => useLibraryLaunchController(), {
      wrapper: withLayers(),
    })

    act(() => result.current.start(game))
    expect(result.current.state).toEqual({ _tag: "Launching", gameId: game.id })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        _tag: "Launched",
        gameId: game.id,
      })
    })
  })

  it("preserves typed failure kind and retries the same game", async () => {
    const { result } = renderHook(() => useLibraryLaunchController(), {
      wrapper: withLayers({ exitCode: 125, failureKind: "moonlight-failed" }),
    })

    act(() => result.current.start(game))

    await waitFor(() => {
      expect(result.current.state).toEqual({
        _tag: "Failed",
        gameId: game.id,
        exitCode: 125,
        failureKind: "moonlight-failed",
      })
    })

    act(() => result.current.retry())
    expect(result.current.state).toEqual({ _tag: "Launching", gameId: game.id })
  })
})
