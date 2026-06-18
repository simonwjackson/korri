import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createGamescopeSessionLifecycleHook } from "./lifecycle-hook"
import type { ReapRequest } from "./reaper"

describe("gamescope session lifecycle hook", () => {
  it("starts the runtime-control bridge after child start and maps cleanup through the reaper", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gamescope-session-hook-"))
    const starts: unknown[] = []
    const reapCalls: ReapRequest[] = []
    const stops: string[] = []
    try {
      const hook = createGamescopeSessionLifecycleHook({
        env: {
          XDG_RUNTIME_DIR: dir,
          KORRI_GAMESCOPE_CONTROL_BRIDGE: "1",
          KORRI_GAMESCOPE_CONTROL_DISPLAY: ":9",
        },
        controlBridge: {
          start: async request => {
            starts.push(request)
            return {
              socketPath: request.socketPath,
              stop: async () => {
                stops.push(request.socketPath)
              },
            }
          },
        },
        reaper: async request => {
          reapCalls.push(request)
          return { reaped: [10], residual: [11] }
        },
      })

      const handle = await hook.afterChildRunning?.({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
      })
      const cleanup = await hook.cleanup?.({
        launchId: "launch-1",
        processGroupId: 42,
      })
      await handle?.stopBeforeCleanup?.()

      expect(starts).toEqual([
        expect.objectContaining({
          launchId: "launch-1",
          runtimeDir: join(dir, "korri-gamescope-control", "launch-1"),
          socketPath: join(
            dir,
            "korri-gamescope-control",
            "launch-1",
            "control.sock",
          ),
          display: ":9",
        }),
      ])
      expect(reapCalls).toEqual([{ pgid: 42 }])
      expect(cleanup).toEqual({ cleaned: [10], residual: [11] })
      expect(stops).toEqual([
        join(dir, "korri-gamescope-control", "launch-1", "control.sock"),
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
