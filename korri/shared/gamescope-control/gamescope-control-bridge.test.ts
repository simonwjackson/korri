import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
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

  it("serializes mutating commands through one bridge-wide queue", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gamescope-control-"))
    const socketPath = join(dir, "control.sock")
    let releaseFilter: (() => void) | undefined
    const filterStarted = deferred<void>()
    const filterRelease = new Promise<void>(resolve => {
      releaseFilter = resolve
    })
    const calls: string[] = []
    const backend: GamescopeControlBackend = {
      getState: async () => ({}),
      setMode: async requested => ({
        _tag: "command.result",
        command: "mode.set",
        status: "applied",
        requested,
        applied: { xwaylandMode: requested },
      }),
      setFilter: async filter => {
        calls.push(`start:${filter}`)
        filterStarted.resolve()
        await filterRelease
        calls.push(`finish:${filter}`)
        return {
          _tag: "command.result",
          command: "filter.set",
          status: "applied",
          requested: { filter },
          applied: { filter },
        }
      },
      setSharpness: async sharpness => {
        calls.push(`sharpness:${sharpness}`)
        return {
          _tag: "command.result",
          command: "sharpness.set",
          status: "applied",
          requested: { sharpness },
          applied: { sharpness },
        }
      },
    }

    const bridge = await startGamescopeControlBridge({ socketPath, backend })
    try {
      const clientA = await connectGamescopeControl({ socketPath })
      const clientB = await connectGamescopeControl({ socketPath })
      try {
        const filterPromise = clientA.setFilter({ filter: "fsr" })
        await filterStarted.promise
        const sharpnessPromise = clientB.setSharpness({ sharpness: 0 })
        await sleep(5)
        expect(calls).toEqual(["start:fsr"])
        releaseFilter?.()
        await filterPromise
        await sharpnessPromise
        expect(calls).toEqual(["start:fsr", "finish:fsr", "sharpness:0"])
      } finally {
        clientA.close()
        clientB.close()
      }
    } finally {
      await bridge.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("pushes command-result events to subscribers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gamescope-control-"))
    const socketPath = join(dir, "control.sock")
    const backend: GamescopeControlBackend = {
      getState: async () => ({ filter: "linear" }),
      setMode: async requested => ({
        _tag: "command.result",
        command: "mode.set",
        status: "applied",
        requested,
        applied: { xwaylandMode: requested },
      }),
      setFilter: async filter => ({
        _tag: "command.result",
        command: "filter.set",
        status: "applied",
        requested: { filter },
        applied: { filter },
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
      const subscriber = await connectGamescopeControl({ socketPath })
      const controller = await connectGamescopeControl({ socketPath })
      const deliveries: unknown[] = []
      try {
        subscriber.onEvent(delivery => deliveries.push(delivery))
        const subscribed = await subscriber.subscribe()
        expect(subscribed.result._tag).toBe("events.subscribed")
        await controller.setFilter({ filter: "fsr" })
        await waitFor(() => deliveries.length > 0)
        expect(deliveries).toContainEqual(
          expect.objectContaining({
            seq: 2,
            event: expect.objectContaining({
              type: "command.result",
              result: expect.objectContaining({
                command: "filter.set",
                status: "applied",
              }),
            }),
          }),
        )
      } finally {
        subscriber.close()
        controller.close()
      }
    } finally {
      await bridge.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns unsupported for valid command methods without backend support", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gamescope-control-"))
    const socketPath = join(dir, "control.sock")
    const backend: GamescopeControlBackend = {
      getState: async () => ({}),
      setMode: async requested => ({
        _tag: "command.result",
        command: "mode.set",
        status: "applied",
        requested,
        applied: { xwaylandMode: requested },
      }),
      setFilter: async filter => ({
        _tag: "command.result",
        command: "filter.set",
        status: "applied",
        requested: { filter },
        applied: { filter },
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
        const response = await client.requestCommand("display.sleep")
        expect(response.result).toMatchObject({
          _tag: "command.result",
          command: "display.sleep",
          status: "unsupported",
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

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 100
  while (Date.now() <= deadline) {
    if (predicate()) return
    await sleep(1)
  }
  throw new Error("timed out waiting for condition")
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}
