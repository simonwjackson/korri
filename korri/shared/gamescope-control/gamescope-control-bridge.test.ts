import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startGamescopeControlBridge } from "./gamescope-control-bridge"
import { connectGamescopeControl } from "./gamescope-control-client"
import type { GamescopeControlBackend } from "./gamescope-control-protocol"

describe("gamescope control bridge", () => {
  it("serves v1 JSON-RPC state and mode mutation over a Unix socket", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gamescope-control-"))
    const socketPath = join(dir, "control.sock")
    const backend: GamescopeControlBackend = {
      getState: async () => ({
        xwaylandMode: { width: 640, height: 360 },
        filter: "linear",
        sharpness: 20,
        fsrFeedback: false,
      }),
      setMode: async requested => ({
        _tag: "command.result",
        command: "mode.set",
        status: "applied",
        requested,
        applied: {
          xwaylandMode: {
            width: requested.width,
            height: requested.height,
          },
          filter: "fsr",
          sharpness: 20,
          fsrFeedback: true,
        },
      }),
      setFilter: async filter => ({
        _tag: "command.result",
        command: "filter.set",
        status: "applied",
        requested: { filter },
        applied: { filter, fsrFeedback: filter === "fsr" },
      }),
      setSharpness: async sharpness => ({
        _tag: "command.result",
        command: "sharpness.set",
        status: "applied",
        requested: { sharpness },
        applied: { sharpness },
      }),
    }

    const bridge = await startGamescopeControlBridge({ socketPath, backend })
    try {
      const client = await connectGamescopeControl({ socketPath })
      try {
        expect((await client.hello()).result.protocol.name).toBe(
          "gamescope.korri-control",
        )
        expect((await client.state()).result.xwaylandMode).toEqual({
          width: 640,
          height: 360,
        })
        const response = await client.setMode({ width: 960, height: 540 })
        expect(response.result.status).toBe("applied")
        expect(response.result.applied.xwaylandMode).toEqual({
          width: 960,
          height: 540,
        })
      } finally {
        client.close()
      }
    } finally {
      await bridge.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
