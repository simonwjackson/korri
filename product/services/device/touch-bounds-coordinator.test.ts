import { describe, expect, it } from "bun:test"
import type { MoonlightControlClient } from "@platform/stream/moonlight-control-client"
import type { CurrentStreamSurfaceGeometry } from "./game-stream-fullscreen"
import { startTouchBoundsCoordinator } from "./touch-bounds-coordinator"

const output = {
  id: 2,
  name: "DSI-1",
  rect: { x: 0, y: 0, width: 1920, height: 1080 },
}

function availableGeometry(x: number): CurrentStreamSurfaceGeometry {
  return {
    status: "available",
    surface: {
      id: 42,
      focused: true,
      fullscreen: false,
      appId: "gamescope",
      rect: { x, y: 0, width: 960, height: 1080 },
      output,
    },
  }
}

describe("touch bounds coordinator", () => {
  it("applies initial dynamic bounds from Moonlight calibration and Sway geometry", async () => {
    const sent: Array<{ x: number; y: number; w: number; h: number }> = []
    const coordinator = await startTouchBoundsCoordinator({
      moonlight: moonlightClient(sent),
      readGeometry: async () => availableGeometry(960),
      pollMs: false,
    })

    expect(sent).toEqual([{ x: 960, y: 0, w: 960, h: 1080 }])
    expect(coordinator.lastAppliedBounds()).toEqual({
      x: 960,
      y: 0,
      w: 960,
      h: 1080,
    })
    await coordinator.close()
  })

  it("recomputes after geometry changes and suppresses duplicates", async () => {
    const sent: Array<{ x: number; y: number; w: number; h: number }> = []
    const geometries = [
      availableGeometry(0),
      availableGeometry(0),
      availableGeometry(960),
    ]
    const coordinator = await startTouchBoundsCoordinator({
      moonlight: moonlightClient(sent),
      readGeometry: async () => geometries.shift() ?? availableGeometry(960),
      pollMs: false,
    })

    await coordinator.tick("test-same")
    await coordinator.tick("test-moved")

    expect(sent).toEqual([
      { x: 0, y: 0, w: 960, h: 1080 },
      { x: 960, y: 0, w: 960, h: 1080 },
    ])
    await coordinator.close()
  })

  it("fails closed before first valid geometry instead of sending full-range bounds", async () => {
    const sent: Array<{ x: number; y: number; w: number; h: number }> = []
    const coordinator = await startTouchBoundsCoordinator({
      moonlight: moonlightClient(sent),
      readGeometry: async () => ({ status: "missing-geometry" }),
      pollMs: false,
    })

    expect(sent).toEqual([])
    expect(coordinator.lastFailure()?.reason).toBe("missing-geometry")
    await coordinator.close()
  })

  it("keeps the previous known-good bounds when applying an update fails", async () => {
    const sent: Array<{ x: number; y: number; w: number; h: number }> = []
    const geometries = [availableGeometry(0), availableGeometry(960)]
    let rejectNext = false
    const coordinator = await startTouchBoundsCoordinator({
      moonlight: moonlightClient(sent, () => rejectNext),
      readGeometry: async () => geometries.shift() ?? availableGeometry(960),
      pollMs: false,
    })

    rejectNext = true
    await coordinator.tick("test-reject")

    expect(sent).toEqual([
      { x: 0, y: 0, w: 960, h: 1080 },
      { x: 960, y: 0, w: 960, h: 1080 },
    ])
    expect(coordinator.lastAppliedBounds()).toEqual({
      x: 0,
      y: 0,
      w: 960,
      h: 1080,
    })
    expect(coordinator.lastFailure()?.reason).toBe("apply-failed")
    await coordinator.close()
  })
})

function moonlightClient(
  sent: Array<{ x: number; y: number; w: number; h: number }>,
  rejectNext: () => boolean = () => false,
): MoonlightControlClient {
  return {
    hello: async () => ({
      jsonrpc: "2.0",
      id: "hello",
      result: {
        _tag: "protocol.hello",
        protocol: { name: "moonlight.local-control", major: 1, minor: 1 },
        session: { sessionId: "session-1" },
        authority: "controller",
        capabilities: {
          events: [],
          commands: ["input.setTouchBounds"],
          experimental: [],
        },
        limits: {} as never,
      },
    }),
    state: async () => ({
      jsonrpc: "2.0",
      id: "state",
      result: {
        _tag: "state.snapshot",
        seq: 1,
        session: { sessionId: "session-1", state: "streaming" },
        streamQuality: { connection: "unknown" },
        runtimeSettings: {},
        input: {
          route: "moonlight-embedded",
          status: "available",
          capabilities: ["absoluteTouch"],
          absoluteTouch: {
            enabled: true,
            boundsRequired: true,
            absRange: { minX: 0, maxX: 1919, minY: 0, maxY: 1079 },
          },
        },
      },
    }),
    subscribe: async () => ({
      jsonrpc: "2.0",
      id: "sub",
      result: { _tag: "events.subscribed", seq: 1 },
    }),
    setBitrate: async () => {
      throw new Error("not used")
    },
    setFps: async () => {
      throw new Error("not used")
    },
    setResolution: async () => {
      throw new Error("not used")
    },
    setTouchBounds: async bounds => {
      sent.push(bounds)
      if (rejectNext()) throw new Error("rejected")
      return {
        jsonrpc: "2.0",
        id: "touch",
        result: {
          _tag: "input.command.result",
          requestId: "touch-1",
          command: "input.setTouchBounds",
          status: "applied",
        },
      }
    },
    onEvent: () => () => undefined,
    close: () => undefined,
  }
}
