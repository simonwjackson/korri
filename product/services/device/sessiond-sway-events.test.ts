import { describe, expect, it } from "bun:test"
import {
  SWAY_IPC_EVENT_TYPE,
  SWAY_IPC_MESSAGE_TYPE,
  SwayIpcFrameDecoderError,
  createSwayIpcFrameDecoder,
  encodeSwayIpcFrameForTest,
} from "./sessiond-sway-events"

function collectDecoder(options: { readonly maxFrameBytes?: number } = {}) {
  const events: unknown[] = []
  const diagnostics: string[] = []
  const decoder = createSwayIpcFrameDecoder({
    ...options,
    onEvent: event => events.push(event),
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
      payload: JSON.stringify({ change: "focus", current: { name: "korri:hub" } }),
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

  it("rejects oversized frames without growing the buffer unbounded", () => {
    const { decoder } = collectDecoder({ maxFrameBytes: 12 })
    const frame = encodeSwayIpcFrameForTest({
      messageType: SWAY_IPC_EVENT_TYPE.window,
      payload: JSON.stringify({ change: "new", container: { id: 1 } }),
    })

    expect(() => decoder.push(frame)).toThrow(SwayIpcFrameDecoderError)
  })
})
