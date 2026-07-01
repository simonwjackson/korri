import { describe, expect, it } from "bun:test"
import { useAtomSet } from "@effect/atom-react"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import {
  loadingForeverLibrarySourceLayer,
  makeInMemoryLibrarySourceLayer,
} from "@platform/library/library-source-layer-memory"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { act, renderHook, waitFor } from "@testing-library/react"
import { type ReactNode, useLayoutEffect } from "react"
import { launcherLayerAtom, librarySourceLayerAtom } from "./library-atoms"
import { useLibraryLaunchController } from "./use-library-launch-controller"

const game: PlayableLibraryEntry = {
  id: "downwell",
  itemId: "downwell",
  title: "Downwell",
  launchable: true,
  releases: [{ id: "windows", system: "windows", launchable: true }],
}

const multiReleaseGame: PlayableLibraryEntry = {
  id: "sonic-the-hedgehog",
  itemId: "sonic-the-hedgehog",
  title: "Sonic the Hedgehog",
  launchable: true,
  releases: [
    { id: "genesis", system: "genesis", launchable: true },
    { id: "windows-known", system: "windows", launchable: false },
    { id: "steam", system: "windows", launchable: true },
  ],
}

const containedGame: PlayableLibraryEntry = {
  id: "super-mario-advance-2/super-mario-world",
  itemId: "super-mario-advance-2",
  containedId: "super-mario-world",
  title: "Super Mario World",
  launchable: true,
  releases: [{ id: "gba", system: "gba", launchable: true }],
}

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
      setSourceLayer(
        makeInMemoryLibrarySourceLayer({
          playableEntries: [game, multiReleaseGame, containedGame],
        }),
      )
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
  it("transitions Idle → Launching → Accepted for a single-release playable", async () => {
    const { result } = renderHook(() => useLibraryLaunchController(), {
      wrapper: withLayers(),
    })

    act(() => result.current.start(game))
    expect(result.current.state).toEqual({
      _tag: "Launching",
      gameId: game.id,
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        _tag: "Accepted",
        gameId: game.id,
      })
    })
  })

  it("requires release selection for multi-launchable playables", () => {
    const { result } = renderHook(() => useLibraryLaunchController(), {
      wrapper: withLayers(),
    })

    act(() => result.current.start(multiReleaseGame))

    expect(result.current.state).toEqual({
      _tag: "ReleaseSelectionRequired",
      gameId: "sonic-the-hedgehog",
      releaseIds: ["genesis", "steam"],
    })
  })

  it("launches a selected release for multi-launchable playables", async () => {
    const { result } = renderHook(() => useLibraryLaunchController(), {
      wrapper: withLayers(),
    })

    act(() => result.current.start({ ...multiReleaseGame, releaseId: "steam" }))

    await waitFor(() => {
      expect(result.current.state).toEqual({
        _tag: "Accepted",
        gameId: "sonic-the-hedgehog",
      })
    })
  })

  it("passes contained playable ids through launch state", async () => {
    const { result } = renderHook(() => useLibraryLaunchController(), {
      wrapper: withLayers(),
    })

    act(() => result.current.start(containedGame))

    await waitFor(() => {
      expect(result.current.state).toEqual({
        _tag: "Accepted",
        gameId: "super-mario-advance-2/super-mario-world",
      })
    })
  })

  it("preserves typed failure kind and retries the same playable release", async () => {
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
    expect(result.current.state).toEqual({
      _tag: "Launching",
      gameId: game.id,
    })
  })
})
