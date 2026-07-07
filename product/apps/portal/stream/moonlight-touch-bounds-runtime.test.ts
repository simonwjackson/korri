import { describe, expect, it } from "bun:test"
import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import type { CurrentStreamSurfaceGeometry } from "@product/services/device/game-stream-fullscreen"
import { startMoonlightTouchBoundsRuntime } from "./moonlight-touch-bounds-runtime"

const output = {
  id: 2,
  name: "DSI-1",
  rect: { x: 0, y: 0, width: 1920, height: 1080 },
}

function availableGeometry(
  x: number,
  width: number,
): CurrentStreamSurfaceGeometry {
  return {
    status: "available",
    surface: {
      id: 8,
      focused: true,
      fullscreen: true,
      appId: "gamescope",
      rect: { x, y: 0, width, height: 1080 },
      output,
    },
  }
}

describe("Moonlight touch-bounds runtime wiring", () => {
  it("keeps touch bounds live when the Gamescope surface changes", async () => {
    const sent: Array<{ x: number; y: number; w: number; h: number }> = []
    const geometries = [availableGeometry(0, 1920), availableGeometry(960, 960)]
    const runtime = await startMoonlightTouchBoundsRuntime({
      socketPath: "/run/user/2000/korri-moonlight/session-1/control.sock",
      moonlight: streamControlSession(sent),
      readGeometry: async () =>
        geometries.shift() ?? availableGeometry(960, 960),
      pollMs: false,
    })

    expect(sent).toEqual([{ x: 0, y: 0, w: 1920, h: 1080 }])

    await runtime?.tick("surface-resized")

    expect(sent).toEqual([
      { x: 0, y: 0, w: 1920, h: 1080 },
      { x: 960, y: 0, w: 960, h: 1080 },
    ])
    await runtime?.close()
  })

  it("keeps touch bounds live when Moonlight content dimensions change", async () => {
    const sent: Array<{ x: number; y: number; w: number; h: number }> = []
    const contentModes = [
      { width: 1440, height: 1080 },
      { width: 1920, height: 1080 },
    ]
    const runtime = await startMoonlightTouchBoundsRuntime({
      socketPath: "/run/user/2000/korri-moonlight/session-1/control.sock",
      moonlight: streamControlSession(sent),
      readGeometry: async () => availableGeometry(0, 1920),
      readContentMode: async () => contentModes.shift(),
      scalingPolicy: { _tag: "fitLetterbox" },
      pollMs: false,
    })

    expect(sent).toEqual([{ x: 240, y: 0, w: 1440, h: 1080 }])

    await runtime?.tick("moonlight-resolution-changed")

    expect(sent).toEqual([
      { x: 240, y: 0, w: 1440, h: 1080 },
      { x: 0, y: 0, w: 1920, h: 1080 },
    ])
    await runtime?.close()
  })
})

function streamControlSession(
  sent: Array<{ x: number; y: number; w: number; h: number }>,
): StreamControlSession {
  return {
    hello: async () => ({
      result: {
        _tag: "protocol.hello",
        capabilities: {
          events: [],
          commands: ["input.setTouchBounds"],
          experimental: [],
        },
      },
    }),
    state: async () => ({
      result: {
        _tag: "state.snapshot",
        input: {
          absoluteTouch: {
            enabled: true,
            boundsRequired: true,
            absRange: { minX: 0, maxX: 1919, minY: 0, maxY: 1079 },
          },
        },
      },
    }),
    setBitrate: async () => ({}),
    setFps: async () => ({}),
    setResolution: async () => ({}),
    subscribe: async () => ({}),
    setTouchBounds: async bounds => {
      sent.push(bounds)
      return {}
    },
    onEvent: () => () => undefined,
    close: () => undefined,
  }
}
