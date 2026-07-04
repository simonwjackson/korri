import { describe, expect, it } from "bun:test"
import type { MoonlightControlClient } from "../moonlight-control-client"
import { moonlightSessionFromClient } from "./session"

interface RecordingClient extends MoonlightControlClient {
  readonly calls: ReadonlyArray<{ method: string; params?: unknown }>
  readonly emit: (delivery: { seq: number; event: unknown }) => void
}

function createRecordingClient(): RecordingClient {
  const calls: { method: string; params?: unknown }[] = []
  const listeners = new Set<
    (delivery: { seq: number; event: unknown }) => void
  >()
  const record =
    (method: string) =>
    (params?: unknown): Promise<{ ok: true }> => {
      calls.push({ method, ...(params !== undefined ? { params } : {}) })
      return Promise.resolve({ ok: true })
    }
  return {
    calls,
    emit: delivery => {
      for (const listener of listeners) listener(delivery)
    },
    // biome-ignore lint/suspicious/noExplicitAny: test double returns a minimal response
    hello: record("hello") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    state: record("state") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    subscribe: record("subscribe") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setBitrate: record("setBitrate") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setFps: record("setFps") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setResolution: record("setResolution") as any,
    // biome-ignore lint/suspicious/noExplicitAny: test double
    setTouchBounds: record("setTouchBounds") as any,
    onEvent: listener => {
      // biome-ignore lint/suspicious/noExplicitAny: MoonlightControlEvent narrows to unknown at the seam
      const wrapped = (d: { seq: number; event: unknown }) => listener(d as any)
      listeners.add(wrapped)
      return () => listeners.delete(wrapped)
    },
    close: () => calls.push({ method: "close" }),
  }
}

describe("moonlightSessionFromClient", () => {
  it("delegates each control method to the underlying client", async () => {
    const client = createRecordingClient()
    const session = moonlightSessionFromClient(client)

    await session.hello()
    await session.setBitrate({ bitrateKbps: 12_000 })
    await session.setResolution({ width: 1920, height: 1080 })
    await session.setTouchBounds({ x: 0, y: 0, w: 1080, h: 1920 })
    session.close()

    expect(client.calls).toEqual([
      { method: "hello" },
      { method: "setBitrate", params: { bitrateKbps: 12_000 } },
      { method: "setResolution", params: { width: 1920, height: 1080 } },
      { method: "setTouchBounds", params: { x: 0, y: 0, w: 1080, h: 1920 } },
      { method: "close" },
    ])
  })

  it("passes event deliveries through opaquely to the platform listener", () => {
    const client = createRecordingClient()
    const session = moonlightSessionFromClient(client)
    const received: Array<{ seq: number; event: unknown }> = []

    const unsubscribe = session.onEvent(delivery => received.push(delivery))
    client.emit({ seq: 7, event: { kind: "state" } })
    unsubscribe()
    client.emit({ seq: 8, event: { kind: "dropped" } })

    expect(received).toEqual([{ seq: 7, event: { kind: "state" } }])
  })
})
