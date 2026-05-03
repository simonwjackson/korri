import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  configureLibraryContextForTesting,
  resetLibraryContextForTesting,
} from "@shared/library/library-context"
import { createRocknixSource } from "@shared/library/rocknix/rocknix-source"
import { createShellLauncher } from "@shared/library/shell-launcher"
import {
  getSpatialNavigationSnapshot,
  startSpatialNavigation,
} from "@shared/navigation/start"
import { act, renderHook, waitFor } from "@testing-library/react"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"
import { withTempLibrary } from "../../../../../tools/testing/library/with-temp-library"

import { useGameLaunch } from "./launch-controller"

// Spawn-call recorder shared across the test launcher wrapper.
let spawnCalls: Array<{ command: string; args: readonly string[] }> = []
let nextExitCode = 0

const cleanups: Array<() => Promise<void>> = []
const savedLocation: { origin?: string; href?: string; pathname?: string } = {}

beforeEach(() => {
  spawnCalls = []
  nextExitCode = 0
})

afterEach(async () => {
  resetLibraryContextForTesting()
  if (savedLocation.origin !== undefined) {
    Object.defineProperty(window.location, "origin", {
      value: savedLocation.origin,
      writable: true,
      configurable: true,
    })
  }
  if (savedLocation.href !== undefined) {
    Object.defineProperty(window.location, "href", {
      value: savedLocation.href,
      writable: true,
      configurable: true,
    })
  }
  if (savedLocation.pathname !== undefined) {
    Object.defineProperty(window.location, "pathname", {
      value: savedLocation.pathname,
      writable: true,
      configurable: true,
    })
  }
  savedLocation.origin = undefined
  savedLocation.href = undefined
  savedLocation.pathname = undefined

  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
  act(() => {
    getSpatialNavigationSnapshot()?.dispose()
  })
})

async function setupRealStack(): Promise<{ rpcUrl: string }> {
  const lib = await withTempLibrary({
    systems: [
      {
        name: "snes",
        defaultEmulator: "retroarch",
        defaultCore: "snes9x",
        extension: [".smc"],
        games: [{ path: "echo.smc", name: "Echo" }],
      },
    ],
  })
  cleanups.push(lib.cleanup)

  const realLauncher = createShellLauncher()
  const launcher = {
    run: (spec: LaunchSpec) => {
      spawnCalls.push({ command: spec.command, args: spec.args })
      return realLauncher.run({
        ...spec,
        env: {
          ...(spec.env ?? {}),
          KORRI_FAKE_GAME_EXIT: String(nextExitCode),
        },
      })
    },
  }

  configureLibraryContextForTesting({
    source: createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    }),
    launcher,
  })

  // Real Hono server on an ephemeral port.
  const harness = await withRpcServer()
  cleanups.push(harness.dispose)

  // Effect's HttpClient resolves relative URLs against globalThis.location.
  // Override origin / href / pathname so /api/rpc resolves to the harness.
  savedLocation.origin = window.location.origin
  savedLocation.href = window.location.href
  savedLocation.pathname = window.location.pathname
  Object.defineProperty(window.location, "origin", {
    value: harness.url,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "href", {
    value: `${harness.url}/`,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "pathname", {
    value: "/",
    writable: true,
    configurable: true,
  })

  return { rpcUrl: harness.rpcUrl }
}

function startInputBus(): ReturnType<typeof startSpatialNavigation> {
  let handle!: ReturnType<typeof startSpatialNavigation>
  act(() => {
    handle = startSpatialNavigation({
      keyboard: false,
      gamepad: false,
      pointer: false,
      wheel: false,
      nextFocus: () => null,
    })
  })
  return handle
}

describe("useGameLaunch (real RPC roundtrip + real fake-game.sh)", () => {
  it("starts in idle status and remains idle when nothing has confirmed", async () => {
    await setupRealStack()
    const { result } = renderHook(() => useGameLaunch("snes/echo.smc"))
    expect(result.current.status).toBe("idle")
    expect(result.current.lastError).toBeUndefined()
    expect(spawnCalls).toHaveLength(0)
  })

  it("transitions idle → launching → idle on a successful launch", async () => {
    await setupRealStack()
    nextExitCode = 0
    const handle = startInputBus()

    const { result } = renderHook(() => useGameLaunch("snes/echo.smc"))

    act(() => handle.bus.emit({ type: "confirm" }))

    await waitFor(() => {
      expect(result.current.status).toBe("idle")
      expect(result.current.lastError).toBeUndefined()
    })
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.args).toContain("-Psnes")
  })

  it("transitions to failed with exitCode when the launch returns non-zero", async () => {
    await setupRealStack()
    nextExitCode = 2
    const handle = startInputBus()

    const { result } = renderHook(() => useGameLaunch("snes/echo.smc"))

    act(() => handle.bus.emit({ type: "confirm" }))

    await waitFor(() => {
      expect(result.current.status).toBe("failed")
    })
    expect(result.current.lastError?.exitCode).toBe(2)
    expect(spawnCalls).toHaveLength(1)
  })

  it("retry() re-fires the launch with the original failed id, not the current focusedId", async () => {
    await setupRealStack()
    nextExitCode = 3
    const handle = startInputBus()

    let focusedId: string | undefined = "snes/echo.smc"
    const { result, rerender } = renderHook(() => useGameLaunch(focusedId))

    act(() => handle.bus.emit({ type: "confirm" }))
    await waitFor(() => {
      expect(result.current.status).toBe("failed")
    })
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.args).toContain("-Psnes")

    // Player navigates away before pressing retry. retry() must still
    // target the originally-failed id.
    focusedId = "snes/some-other.smc"
    rerender()

    nextExitCode = 0
    act(() => result.current.retry())
    await waitFor(() => {
      expect(result.current.status).toBe("idle")
    })
    expect(spawnCalls).toHaveLength(2)
    // Both calls hit the same -Psnes / --core=snes9x argv shape, derived
    // from the same id.
    expect(spawnCalls[1]?.args).toEqual(spawnCalls[0]?.args)
  })

  it("ignores confirm when focusedId is undefined", async () => {
    await setupRealStack()
    const handle = startInputBus()

    const { result } = renderHook(() => useGameLaunch(undefined))
    act(() => handle.bus.emit({ type: "confirm" }))

    expect(result.current.status).toBe("idle")
    expect(spawnCalls).toHaveLength(0)
  })

  it("debounces — confirm fired twice in rapid succession spawns exactly once", async () => {
    await setupRealStack()
    nextExitCode = 0
    const handle = startInputBus()

    const { result } = renderHook(() => useGameLaunch("snes/echo.smc"))

    act(() => {
      handle.bus.emit({ type: "confirm" })
      handle.bus.emit({ type: "confirm" })
    })

    await waitFor(() => {
      expect(result.current.status).toBe("idle")
    })
    expect(spawnCalls).toHaveLength(1)
  })

  it("does not auto-launch on focus change — changing focusedId never spawns", async () => {
    await setupRealStack()
    startInputBus()

    let focusedId: string | undefined = "snes/echo.smc"
    const { rerender } = renderHook(() => useGameLaunch(focusedId))
    focusedId = "snes/something-else.smc"
    rerender()
    focusedId = undefined
    rerender()

    expect(spawnCalls).toHaveLength(0)
  })

  it("unsubscribes useInputAction on unmount (no spawn after unmount)", async () => {
    await setupRealStack()
    const handle = startInputBus()

    const { unmount } = renderHook(() => useGameLaunch("snes/echo.smc"))
    unmount()

    act(() => handle.bus.emit({ type: "confirm" }))
    expect(spawnCalls).toHaveLength(0)
  })
})
