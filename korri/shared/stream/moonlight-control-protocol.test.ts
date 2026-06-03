import { describe, expect, it } from "bun:test"
import {
  decodeMoonlightControlCommandRequest,
  decodeMoonlightControlMessage,
  decodeMoonlightControlResponse,
  MOONLIGHT_CONTROL_PROTOCOL,
  MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
  type MoonlightControlEventEnvelope,
  type MoonlightControlSuccessResponse,
} from "./moonlight-control-protocol"

describe("moonlight local control protocol", () => {
  it("decodes a v1 protocol.hello response and preserves additive fields", () => {
    const decoded = expectSuccessResponse(
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "hello-1",
        result: {
          _tag: "protocol.hello",
          protocol: {
            name: MOONLIGHT_CONTROL_PROTOCOL.name,
            major: 1,
            minor: 0,
            extraProtocolField: "preserved",
          },
          session: {
            sessionId: "session-abc",
            processId: 4242,
          },
          authority: "observer",
          capabilities: {
            events: ["lifecycle", "quality", "input"],
            commands: [],
            experimental: [],
          },
          limits: MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
          additive: { survives: true },
        },
      }),
    )

    expect(decoded.result._tag).toBe("protocol.hello")
    if (decoded.result._tag === "protocol.hello") {
      expect(decoded.result.protocol.extraProtocolField).toBe("preserved")
      expect(decoded.result.additive).toEqual({ survives: true })
      expect(decoded.result.capabilities.commands).toEqual([])
    }
  })

  it("decodes a state snapshot with lifecycle quality runtime and input facts", () => {
    const decoded = expectSuccessResponse(
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          _tag: "state.snapshot",
          seq: 17,
          session: {
            sessionId: "session-abc",
            state: "streaming",
            appName: "Korri Stream",
          },
          streamQuality: {
            connection: "okay",
            bitrateKbps: 18_000,
            fps: 60,
            width: 1280,
            height: 720,
          },
          runtimeSettings: {
            appliedBitrateKbps: 18_000,
            appliedFps: 60,
            appliedResolution: { width: 1280, height: 720 },
            lastCommand: {
              requestId: "cmd-1",
              command: "runtime.setBitrate",
              status: "applied",
            },
          },
          input: {
            route: "moonlight-embedded",
            status: "available",
            capabilities: ["gamepad", "touch"],
          },
        },
      }),
    )

    expect(decoded.result._tag).toBe("state.snapshot")
    if (decoded.result._tag === "state.snapshot") {
      expect(decoded.result.seq).toBe(17)
      expect(decoded.result.streamQuality.bitrateKbps).toBe(18_000)
      expect(decoded.result.input.status).toBe("available")
    }
  })

  it("decodes an event subscription response", () => {
    const decoded = expectSuccessResponse(
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "subscribe-1",
        result: { _tag: "events.subscribed", seq: 3 },
      }),
    )

    expect(decoded.result._tag).toBe("events.subscribed")
    if (decoded.result._tag === "events.subscribed") {
      expect(decoded.result.seq).toBe(3)
    }
  })

  it("decodes ordered event envelopes with increasing seq values", () => {
    const first = decodeMoonlightControlMessage({
      jsonrpc: "2.0",
      method: "moonlight.event",
      params: {
        seq: 1,
        monotonicMs: 100,
        event: { name: "lifecycle.streaming", state: "streaming" },
      },
    }) as MoonlightControlEventEnvelope
    const second = decodeMoonlightControlMessage({
      jsonrpc: "2.0",
      method: "moonlight.event",
      params: {
        seq: 2,
        monotonicMs: 110,
        event: { name: "quality.connection", connection: "poor" },
      },
    }) as MoonlightControlEventEnvelope

    expect(first.params.seq).toBeLessThan(second.params.seq)
    expect(first.params.event.name).toBe("lifecycle.streaming")
    expect(second.params.event.name).toBe("quality.connection")
  })

  it("preserves unknown event names instead of rejecting the stream", () => {
    const decoded = decodeMoonlightControlMessage({
      jsonrpc: "2.0",
      method: "moonlight.event",
      params: {
        seq: 9,
        monotonicMs: 120,
        event: {
          name: "decoder.futureMetric",
          decoderQueueDepth: 3,
        },
      },
    }) as MoonlightControlEventEnvelope

    expect(decoded.params.event.name).toBe("decoder.futureMetric")
    expect(decoded.params.event._tag).toBe("unknown.event")
    expect(decoded.params.event.payload).toEqual({ decoderQueueDepth: 3 })
  })

  it("decodes runtime command result events for all caller-visible statuses", () => {
    const statuses = [
      "accepted",
      "applied",
      "failed",
      "invalid",
      "disabled",
      "unsupported",
      "timed-out",
      "not-streaming",
      "unauthorized",
      "conflict",
    ] as const

    for (const status of statuses) {
      const decoded = decodeMoonlightControlMessage({
        jsonrpc: "2.0",
        method: "moonlight.event",
        params: {
          seq: 1,
          monotonicMs: 100,
          event: {
            name: "runtime.commandResult",
            requestId: "cmd-1",
            command: "runtime.setResolution",
            status,
          },
        },
      }) as MoonlightControlEventEnvelope

      expect(decoded.params.event.name).toBe("runtime.commandResult")
      expect("status" in decoded.params.event).toBe(true)
      if ("status" in decoded.params.event) {
        expect(decoded.params.event.status).toBe(status)
      }
    }
  })

  it("rejects a command response without a request id", () => {
    expect(() =>
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        result: {
          _tag: "command.accepted",
          command: "runtime.setBitrate",
          requestId: "cmd-1",
        },
      }),
    ).toThrow(/id/)
  })

  it("rejects malformed protocol versions and discriminators", () => {
    expect(() =>
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "hello-1",
        result: {
          _tag: "protocol.hello",
          protocol: {
            name: MOONLIGHT_CONTROL_PROTOCOL.name,
            major: 2,
            minor: 0,
          },
          session: { sessionId: "session-abc" },
          authority: "observer",
          capabilities: { events: [], commands: [], experimental: [] },
          limits: MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
        },
      }),
    ).toThrow(/major/)

    expect(() =>
      decodeMoonlightControlMessage({
        jsonrpc: "2.0",
        method: "moonlight.event",
        params: { seq: 1, monotonicMs: 1, event: { type: "bad" } },
      }),
    ).toThrow(/name/)
  })

  it("accepts positive runtime command values before native dispatch", () => {
    const bitrate = decodeMoonlightControlCommandRequest({
      jsonrpc: "2.0",
      id: "cmd-1",
      method: "runtime.setBitrate",
      params: { bitrateKbps: 1 },
    })
    const fps = decodeMoonlightControlCommandRequest({
      jsonrpc: "2.0",
      id: "cmd-2",
      method: "runtime.setFps",
      params: { fps: 1 },
    })
    const resolution = decodeMoonlightControlCommandRequest({
      jsonrpc: "2.0",
      id: "cmd-3",
      method: "runtime.setResolution",
      params: { width: 1, height: 1 },
    })

    expect(bitrate.method).toBe("runtime.setBitrate")
    expect(fps.method).toBe("runtime.setFps")
    expect(resolution.method).toBe("runtime.setResolution")
  })

  it("rejects non-positive command values before native dispatch", () => {
    expect(() =>
      decodeMoonlightControlCommandRequest({
        jsonrpc: "2.0",
        id: "cmd-1",
        method: "runtime.setBitrate",
        params: { bitrateKbps: 0 },
      }),
    ).toThrow(/bitrateKbps/)

    expect(() =>
      decodeMoonlightControlCommandRequest({
        jsonrpc: "2.0",
        id: "cmd-2",
        method: "runtime.setFps",
        params: { fps: -1 },
      }),
    ).toThrow(/fps/)

    expect(() =>
      decodeMoonlightControlCommandRequest({
        jsonrpc: "2.0",
        id: "cmd-3",
        method: "runtime.setResolution",
        params: { width: 0, height: -1 },
      }),
    ).toThrow(/width/)
  })
})

function expectSuccessResponse(
  response: ReturnType<typeof decodeMoonlightControlResponse>,
): MoonlightControlSuccessResponse {
  if ("result" in response) return response
  throw new Error(`Expected success response, got ${response.error.message}`)
}
