import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { useAtomSet } from "@effect/atom-react"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@platform/browser/navigation/start"
import type { LaunchController } from "@platform/library/launch-state"
import { LaunchState } from "@platform/library/launch-state"
import { foregroundSessionStatusLayerAtom } from "@platform/react/library/library-atoms"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type ReactNode, useLayoutEffect } from "react"
import { ShiftCatalogStateRoot } from "../catalog/ShiftCatalogStateRoot"
import { ShiftHomeReadyBody } from "./ShiftHomeReadyBody"

const games = [
  {
    id: "resume",
    itemId: "resume",
    title: "Resume",
    system: "fixture",
    launchable: true,
    releases: [{ id: "fixture", system: "fixture", launchable: true }],
    metadata: { name: "Resume" },
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  },
  {
    id: "second",
    itemId: "second",
    title: "Second",
    system: "fixture",
    launchable: true,
    releases: [{ id: "fixture", system: "fixture", launchable: true }],
    metadata: { name: "Second" },
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  },
]

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  cleanup()
  handle.dispose()
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
        "self::resume",
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
        "self::resume",
      )
    })

    await act(async () => {
      handle.bus.emit({ type: "confirm" })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(launched).toEqual([])
  })

  it("renders Steam lifecycle detail from the existing foreground status poll", async () => {
    renderReadyBody(
      {
        state: LaunchState.idle,
        start: () => {},
        retry: () => {},
      },
      {
        foreground: {
          _tag: "Preparing",
          state: "Spawning",
          requestId: "launch-30xx",
          gameId: "resume",
          providerLifecycle: {
            providerId: "@korri:steam",
            observerHealth: "running",
            lifecycleStatus: "active",
            providerPhase: "shader-preparing",
            displayMessage: "Steam is checking shader cache metadata.",
            nextActionHint: "wait",
            appId: "1029210",
            launchId: "launch-30xx",
          },
        },
      },
    )

    expect(await screen.findByText("Preparing stream")).toBeTruthy()
    expect(
      screen.getByText("Steam is checking shader cache metadata."),
    ).toBeTruthy()
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
        "self::resume",
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
      <ShiftCatalogStateRoot result={AsyncResult.success(snapshotWith(games))}>
        <ShiftHomeReadyBody launch={launch} />
      </ShiftCatalogStateRoot>
    </Wrapper>,
  )
}

function snapshotWith(entries: typeof games) {
  return {
    entries,
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready" as const,
        entryCount: entries.length,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready" as const,
      loadingPeers: 0,
      readyPeers: 0,
      failedPeers: 0,
      generation: 1,
    },
  }
}
