import { describe, expect, it } from "bun:test"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import {
  connectStreamControlSession,
  resolveStreamControlConnector,
  type StreamControlSession,
} from "./stream-control-session"

function sessionFor(socketPath: string): StreamControlSession {
  return {
    hello: () => Promise.resolve({ socketPath }),
    state: () => Promise.resolve({ socketPath }),
    subscribe: () => Promise.resolve({ ok: true }),
    setBitrate: () => Promise.resolve({ ok: true }),
    setFps: () => Promise.resolve({ ok: true }),
    setResolution: () => Promise.resolve({ ok: true }),
    setTouchBounds: () => Promise.resolve({ ok: true }),
    onEvent: () => () => {},
    close: () => {},
  }
}

const streamerPlugin = plugin({
  namespace: "@example",
  name: "streamer",
  contributes: {
    handlers: [
      {
        id: "example.stream-control-connect",
        operation: "stream-control.connect",
        capabilities: ["stream-control.connect"],
        run: context =>
          sessionFor((context.input as { socketPath: string }).socketPath),
      },
    ],
  },
})

const withStreamer = createPluginRegistry([streamerPlugin], {
  enabledPluginIds: [streamerPlugin.id],
})
const empty = createPluginRegistry([], {})

describe("stream-control-session", () => {
  it("resolves the enabled connector and its provider", () => {
    const resolved = resolveStreamControlConnector(withStreamer)
    expect(resolved?.provider).toBe(streamerPlugin.id)
    expect(resolved?.handler.operation).toBe("stream-control.connect")
  })

  it("dispatches connect and returns a usable session", async () => {
    const session = await connectStreamControlSession(withStreamer, {
      socketPath: "/run/control.sock",
    })
    await expect(session.hello()).resolves.toEqual({
      socketPath: "/run/control.sock",
    })
  })

  it("fails closed when no plugin provides a control session", async () => {
    await expect(
      connectStreamControlSession(empty, { socketPath: "/run/control.sock" }),
    ).rejects.toThrow(/no enabled plugin provides a control session/)
  })
})
