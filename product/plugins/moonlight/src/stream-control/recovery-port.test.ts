import { describe, expect, it } from "bun:test"
import type {
  MoonlightControlClient,
  MoonlightControlEventDelivery,
} from "../moonlight-control-client"
import type { MoonlightControlSuccessResponse } from "../moonlight-control-protocol"
import { moonlightRecoveryControlPortFromClient } from "./recovery-port"

function success(result: unknown): MoonlightControlSuccessResponse {
  return { jsonrpc: "2.0", id: 1, result } as MoonlightControlSuccessResponse
}

function makeClient() {
  const listeners: ((delivery: MoonlightControlEventDelivery) => void)[] = []
  const calls: string[] = []
  const queued: MoonlightControlSuccessResponse[] = []
  const next = (fallback: unknown) => queued.shift() ?? success(fallback)
  const client: MoonlightControlClient = {
    hello: async () => success({ _tag: "protocol.hello" }),
    state: async () => success({ _tag: "state.snapshot" }),
    subscribe: async () => success({ _tag: "events.subscribed" }),
    setBitrate: async params => {
      calls.push(`setBitrate:${params.bitrateKbps}`)
      return next({
        _tag: "command.accepted",
        requestId: "bitrate-1",
        command: "runtime.setBitrate",
      })
    },
    setFps: async params => {
      calls.push(`setFps:${params.fps}`)
      return next({
        _tag: "command.accepted",
        requestId: "fps-1",
        command: "runtime.setFps",
      })
    },
    setResolution: async params => {
      calls.push(`setResolution:${params.width}x${params.height}`)
      return next({
        _tag: "command.accepted",
        requestId: "resolution-1",
        command: "runtime.setResolution",
      })
    },
    setTouchBounds: async () => success({ _tag: "input.command.accepted" }),
    onEvent: listener => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    close: () => calls.push("close"),
  }
  return {
    client,
    calls,
    queue: (response: MoonlightControlSuccessResponse) => queued.push(response),
    emit: (event: unknown) => {
      for (const listener of [...listeners]) {
        listener({ seq: 1, event } as MoonlightControlEventDelivery)
      }
    },
  }
}

describe("moonlightRecoveryControlPortFromClient", () => {
  it("extracts command request ids from accepted setter responses", async () => {
    const harness = makeClient()
    const port = moonlightRecoveryControlPortFromClient(harness.client)

    await expect(port.setBitrate({ bitrateKbps: 12_000 })).resolves.toBe(
      "bitrate-1",
    )
    await expect(port.setFps({ fps: 60 })).resolves.toBe("fps-1")
    await expect(
      port.setResolution({ width: 1280, height: 720 }),
    ).resolves.toBe("resolution-1")

    expect(harness.calls).toEqual([
      "setBitrate:12000",
      "setFps:60",
      "setResolution:1280x720",
    ])
  })

  it("returns undefined when a setter response is not command.accepted", async () => {
    const harness = makeClient()
    const port = moonlightRecoveryControlPortFromClient(harness.client)
    harness.queue(success({ _tag: "command.result", status: "invalid" }))

    await expect(port.setBitrate({ bitrateKbps: 1 })).resolves.toBeUndefined()
  })

  it("forwards only runtime command result events", () => {
    const harness = makeClient()
    const port = moonlightRecoveryControlPortFromClient(harness.client)
    const results: unknown[] = []
    const unsubscribe = port.onResult(result => results.push(result))

    harness.emit({ name: "quality.sample", sample: { seq: 1, sampledAtMs: 1 } })
    harness.emit({
      name: "runtime.commandResult",
      requestId: "resolution-1",
      command: "runtime.setResolution",
      status: "failed",
      reason: "decode-stall",
    })
    unsubscribe()
    harness.emit({
      name: "runtime.commandResult",
      requestId: "late",
      command: "runtime.setBitrate",
      status: "applied",
    })

    expect(results).toEqual([
      {
        requestId: "resolution-1",
        command: "runtime.setResolution",
        status: "failed",
      },
    ])
  })
})
