import { describe, expect, it } from "bun:test"
import {
  createSessiondSwayEventSource,
  createSwayIpcFrameDecoder,
  encodeSwayIpcFrameForTest,
  type SessiondSwayEvent,
  SWAY_IPC_EVENT_TYPE,
  SWAY_IPC_MESSAGE_TYPE,
  SwayIpcFrameDecoderError,
} from "./sessiond-sway-events"

function collectDecoder(options: { readonly maxFrameBytes?: number } = {}) {
  const events: SessiondSwayEvent[] = []
  const diagnostics: string[] = []
  const decoder = createSwayIpcFrameDecoder({
    ...options,
    onEvent: event => {
      events.push(event)
    },
    onDiagnostic: diagnostic => diagnostics.push(diagnostic.message),
  })
  return { decoder, events, diagnostics }
}

describe("sessiond Sway IPC event decoder", () => {
  it("decodes window event frames without mixing framing and JSON parsing", () => {
    const { decoder, events, diagnostics } = collectDecoder()
    const frame = encodeSwayIpcFrameForTest({
      messageType: SWAY_IPC_EVENT_TYPE.window,
      payload: JSON.stringify({
        change: "new",
        container: { id: 44, name: "Game", app_id: "foot" },
      }),
    })

    decoder.push(frame)

    expect(diagnostics).toEqual([])
    expect(events).toEqual([
      {
        kind: "window",
        change: "new",
        container: { id: 44, name: "Game", app_id: "foot" },
      },
    ])
  })

  it("buffers partial frames until a full frame is available", () => {
    const { decoder, events } = collectDecoder()
    const frame = encodeSwayIpcFrameForTest({
      messageType: SWAY_IPC_EVENT_TYPE.workspace,
      payload: JSON.stringify({
        change: "focus",
        current: { id: 2, name: "korri:game:active" },
        old: { id: 1, name: "korri:hub" },
      }),
    })

    decoder.push(frame.slice(0, 8))
    expect(events).toEqual([])

    decoder.push(frame.slice(8))
    expect(events).toEqual([
      {
        kind: "workspace",
        change: "focus",
        current: { id: 2, name: "korri:game:active" },
        old: { id: 1, name: "korri:hub" },
      },
    ])
  })

  it("emits multiple frames from one chunk in order", () => {
    const { decoder, events } = collectDecoder()
    const windowFrame = encodeSwayIpcFrameForTest({
      messageType: SWAY_IPC_EVENT_TYPE.window,
      payload: JSON.stringify({ change: "close", container: { id: 7 } }),
    })
    const workspaceFrame = encodeSwayIpcFrameForTest({
      messageType: SWAY_IPC_EVENT_TYPE.workspace,
      payload: JSON.stringify({
        change: "focus",
        current: { name: "korri:hub" },
      }),
    })

    decoder.push(new Uint8Array([...windowFrame, ...workspaceFrame]))

    expect(events.map(event => event.kind)).toEqual(["window", "workspace"])
  })

  it("surfaces invalid JSON and unknown event types as diagnostics", () => {
    const { decoder, events, diagnostics } = collectDecoder()

    decoder.push(
      encodeSwayIpcFrameForTest({
        messageType: SWAY_IPC_EVENT_TYPE.window,
        payload: "{not json",
      }),
    )
    decoder.push(
      encodeSwayIpcFrameForTest({
        messageType: SWAY_IPC_MESSAGE_TYPE.subscribe,
        payload: JSON.stringify({ success: true }),
      }),
    )

    expect(events).toEqual([])
    expect(diagnostics).toEqual([
      "invalid Sway IPC event JSON",
      "ignored non-event Sway IPC message",
    ])
  })

  it("starts a narrow event source by subscribing to Sway window/workspace events", async () => {
    const written: Uint8Array[] = []
    let pushData: ((data: Uint8Array) => void) | undefined
    const events: SessiondSwayEvent[] = []
    const source = createSessiondSwayEventSource({
      socketPath: "/run/user/1000/sway-ipc.sock",
      connector: async ({ socketPath, onData }) => {
        expect(socketPath).toBe("/run/user/1000/sway-ipc.sock")
        pushData = onData
        return {
          write: data => written.push(data),
          close: () => {},
        }
      },
      onEvent: event => {
        events.push(event)
      },
    })

    await source.start()
    expect(written).toHaveLength(1)

    pushData?.(
      encodeSwayIpcFrameForTest({
        messageType: SWAY_IPC_EVENT_TYPE.window,
        payload: JSON.stringify({ change: "new", container: { id: 88 } }),
      }),
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(events).toEqual([
      { kind: "window", change: "new", container: { id: 88 } },
    ])
  })

  it("reports open and closed status for lane capability gating", async () => {
    let closeSocket: (() => void) | undefined
    const statuses: string[] = []
    const source = createSessiondSwayEventSource({
      socketPath: "/run/user/1000/sway-ipc.sock",
      connector: async ({ onClose }) => {
        closeSocket = onClose
        return {
          write: () => {},
          close: () => onClose?.(),
        }
      },
      onEvent: () => {},
      onStatus: status => statuses.push(status),
    })

    await source.start()
    closeSocket?.()

    expect(statuses).toEqual(["open", "closed"])
  })

  it("serializes async event handlers instead of interleaving Sway events", async () => {
    const written: Uint8Array[] = []
    let pushData: ((data: Uint8Array) => void) | undefined
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstBlocked = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const source = createSessiondSwayEventSource({
      socketPath: "/run/user/1000/sway-ipc.sock",
      connector: async ({ onData }) => {
        pushData = onData
        return {
          write: data => written.push(data),
          close: () => {},
        }
      },
      onEvent: async event => {
        order.push(`start:${event.kind}`)
        if (order.length === 1) await firstBlocked
        order.push(`end:${event.kind}`)
      },
    })

    await source.start()
    pushData?.(
      new Uint8Array([
        ...encodeSwayIpcFrameForTest({
          messageType: SWAY_IPC_EVENT_TYPE.window,
          payload: JSON.stringify({ change: "new", container: { id: 1 } }),
        }),
        ...encodeSwayIpcFrameForTest({
          messageType: SWAY_IPC_EVENT_TYPE.window,
          payload: JSON.stringify({ change: "close", container: { id: 1 } }),
        }),
      ]),
    )

    await Promise.resolve()
    expect(order).toEqual(["start:window"])
    releaseFirst?.()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(order).toEqual([
      "start:window",
      "end:window",
      "start:window",
      "end:window",
    ])
  })

  it("rejects oversized frames without growing the buffer unbounded", () => {
    const { decoder } = collectDecoder({ maxFrameBytes: 12 })
    const frame = encodeSwayIpcFrameForTest({
      messageType: SWAY_IPC_EVENT_TYPE.window,
      payload: JSON.stringify({ change: "new", container: { id: 1 } }),
    })

    expect(() => decoder.push(frame)).toThrow(SwayIpcFrameDecoderError)
  })
})
