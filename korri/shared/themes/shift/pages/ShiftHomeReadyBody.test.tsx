import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { useAtomSet } from "@effect/atom-react"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@platform/browser/navigation/start"
import { foregroundSessionStatusLayerAtom } from "@platform/react/library/library-atoms"
import { LibraryListStateRoot } from "@platform/react/library/library-list-state-root"
import type { LaunchController } from "@shared/library/launch-state"
import { LaunchState } from "@shared/library/launch-state"
import type { ForegroundSessionGateState } from "@shared/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@shared/stream/foreground-session-status-source"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type ReactNode, useLayoutEffect } from "react"
import { ShiftHomeReadyBody } from "./ShiftHomeReadyBody"

const games = [
  {
    id: "resume",
    system: "fixture",
    contentPath: "/storage/fixtures/resume.rom",
    metadata: { name: "Resume" },
  },
  {
    id: "second",
    system: "fixture",
    contentPath: "/storage/fixtures/second.rom",
    metadata: { name: "Second" },
  },
]

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  cleanup()
  handle.dispose()
  document.documentElement.style.removeProperty("--ui-scale")
})

describe("ShiftHomeReadyBody", () => {
  it("lets the focused Labs button handle confirm without launching the focused game", async () => {
    const launched: string[] = []

    renderReadyBody({
      state: LaunchState.idle,
      start: game => launched.push(game.id),
      retry: () => {},
    })

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-tile-id")).toBe(
        "resume",
      )
    })

    const labs = screen.getByRole("button", { name: "Labs" })
    labs.focus()

    await act(async () => {
      handle.bus.emit({ type: "confirm" })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(screen.getByRole("dialog", { name: "Labs" })).toBeTruthy()
    expect(launched).toEqual([])
  })

  it("explains and suppresses launch while foreground session is running", async () => {
    const launched: string[] = []

    renderReadyBody(
      {
        state: LaunchState.idle,
        start: game => launched.push(game.id),
        retry: () => {},
      },
      {
        foreground: {
          _tag: "Running",
          requestId: "request-1",
          gameId: "resume",
        },
      },
    )

    expect(await screen.findByText("Stream already active")).toBeTruthy()

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-tile-id")).toBe(
        "resume",
      )
    })

    await act(async () => {
      handle.bus.emit({ type: "confirm" })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(launched).toEqual([])
  })

  it("launches the focused tile once when confirm activates the tile button", async () => {
    const launched: string[] = []

    renderReadyBody({
      state: LaunchState.idle,
      start: game => launched.push(game.id),
      retry: () => {},
    })

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-tile-id")).toBe(
        "resume",
      )
    })

    await act(async () => {
      handle.bus.emit({ type: "confirm" })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(launched).toEqual(["resume"])
  })
})

function renderReadyBody(
  launch: LaunchController,
  options: { readonly foreground?: ForegroundSessionGateState } = {},
) {
  const foreground = options.foreground ?? ({ _tag: "Ready" } as const)
  function Wrapper({ children }: { readonly children: ReactNode }) {
    const setForegroundLayer = useAtomSet(foregroundSessionStatusLayerAtom)

    useLayoutEffect(() => {
      setForegroundLayer(
        Layer.succeed(ForegroundSessionStatusSource)({
          get: () => Effect.succeed(foreground),
        }),
      )
      return () => {
        setForegroundLayer(
          Layer.succeed(ForegroundSessionStatusSource)({
            get: () => Effect.succeed({ _tag: "Ready" as const }),
          }),
        )
      }
    }, [setForegroundLayer])

    return <>{children}</>
  }

  return render(
    <Wrapper>
      <LibraryListStateRoot result={AsyncResult.success(games)}>
        <ShiftHomeReadyBody launch={launch} />
      </LibraryListStateRoot>
    </Wrapper>,
  )
}
