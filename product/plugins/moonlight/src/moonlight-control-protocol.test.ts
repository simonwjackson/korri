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
            commands: ["input.setTouchBounds"],
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
      expect(decoded.result.capabilities.commands).toEqual([
        "input.setTouchBounds",
      ])
    }
  })

  it("does not synthesize command capability from controller authority", () => {
    const decoded = expectSuccessResponse(
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "hello-controller",
        result: {
          _tag: "protocol.hello",
          protocol: {
            name: MOONLIGHT_CONTROL_PROTOCOL.name,
            major: 1,
            minor: 0,
          },
          session: {
            sessionId: "session-controller",
            processId: 4242,
          },
          authority: "controller",
          capabilities: {
            events: ["lifecycle"],
            commands: [],
            experimental: [],
          },
          limits: MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
        },
      }),
    )

    expect(decoded.result._tag).toBe("protocol.hello")
    if (decoded.result._tag === "protocol.hello") {
      expect(decoded.result.authority).toBe("controller")
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
            sample: {
              seq: 12,
              sampledAtMs: 1700,
              rttMs: 20,
              rttVarianceMs: 5,
              lossFraction: 0.02,
              deliveredBitrateKbps: 17_500,
              requestedBitrateKbps: 18_000,
              deliveredFps: 59,
              requestedFps: 60,
              framesDropped: 1,
              decodeTimeMs: 7,
              queueDepth: 1,
              firstFrameMs: 91,
            },
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
            absoluteTouch: {
              enabled: true,
              boundsRequired: true,
              activeBounds: { x: 120, y: 0, w: 960, h: 720 },
              absRange: { minX: 0, maxX: 1919, minY: 0, maxY: 1079 },
              lastCommand: {
                requestId: "input-1",
                command: "input.setTouchBounds",
                status: "applied",
              },
            },
          },
        },
      }),
    )

    expect(decoded.result._tag).toBe("state.snapshot")
    if (decoded.result._tag === "state.snapshot") {
      expect(decoded.result.seq).toBe(17)
      expect(decoded.result.streamQuality.bitrateKbps).toBe(18_000)
      expect(decoded.result.streamQuality.sample?.rttMs).toBe(20)
      expect(decoded.result.input.status).toBe("available")
      expect(decoded.result.input.absoluteTouch?.activeBounds).toEqual({
        x: 120,
        y: 0,
        w: 960,
        h: 720,
      })
      expect(decoded.result.input.absoluteTouch?.lastCommand?.command).toBe(
        "input.setTouchBounds",
      )
    }
  })

  it("accepts stalled stream health samples with zero delivery", () => {
    const decoded = expectSuccessResponse(
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "stalled-snapshot-sample",
        result: {
          _tag: "state.snapshot",
          seq: 18,
          session: { sessionId: "session-abc", state: "streaming" },
          streamQuality: {
            connection: "poor",
            sample: {
              seq: 13,
              sampledAtMs: 1800,
              deliveredBitrateKbps: 0,
              requestedBitrateKbps: 6000,
              deliveredFps: 0,
              requestedFps: 60,
            },
          },
          runtimeSettings: {},
          input: {
            route: "moonlight-embedded",
            status: "available",
            capabilities: [],
          },
        },
      }),
    )

    if (decoded.result._tag === "state.snapshot") {
      expect(decoded.result.streamQuality.sample?.deliveredBitrateKbps).toBe(0)
      expect(decoded.result.streamQuality.sample?.deliveredFps).toBe(0)
    }
  })

  it("rejects invalid stream health samples in snapshots", () => {
    expect(() =>
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "bad-snapshot-sample",
        result: {
          _tag: "state.snapshot",
          seq: 18,
          session: { sessionId: "session-abc", state: "streaming" },
          streamQuality: {
            connection: "okay",
            sample: { seq: 13, sampledAtMs: 1800, lossFraction: -0.1 },
          },
          runtimeSettings: {},
          input: {
            route: "moonlight-embedded",
            status: "available",
            capabilities: [],
          },
        },
      }),
    ).toThrow()
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

  it("decodes stream health sample events", () => {
    const decoded = decodeMoonlightControlMessage({
      jsonrpc: "2.0",
      method: "moonlight.event",
      params: {
        seq: 3,
        monotonicMs: 1250,
        event: {
          name: "quality.sample",
          sample: {
            seq: 44,
            sampledAtMs: 1250,
            rttMs: 18,
            rttVarianceMs: 4,
            lossFraction: 0.015,
            deliveredBitrateKbps: 11_800,
            requestedBitrateKbps: 13_000,
            deliveredFps: 58,
            requestedFps: 60,
            framesDropped: 3,
            decodeTimeMs: 6,
            queueDepth: 2,
            firstFrameMs: 83,
          },
        },
      },
    }) as MoonlightControlEventEnvelope

    expect(decoded.params.event.name).toBe("quality.sample")
    if (decoded.params.event.name === "quality.sample") {
      expect(decoded.params.event.sample.lossFraction).toBe(0.015)
      expect(decoded.params.event.sample.deliveredFps).toBe(58)
    }
  })

  it("decodes partial stream health samples", () => {
    const decoded = decodeMoonlightControlMessage({
      jsonrpc: "2.0",
      method: "moonlight.event",
      params: {
        seq: 4,
        monotonicMs: 1300,
        event: {
          name: "quality.sample",
          sample: { seq: 45, sampledAtMs: 1300, rttMs: 19, lossFraction: 0 },
        },
      },
    }) as MoonlightControlEventEnvelope

    expect(decoded.params.event.name).toBe("quality.sample")
    if (decoded.params.event.name === "quality.sample") {
      expect(decoded.params.event.sample.rttMs).toBe(19)
      expect(decoded.params.event.sample.decodeTimeMs).toBeUndefined()
    }
  })

  it("rejects invalid stream health samples for known quality.sample events", () => {
    expect(() =>
      decodeMoonlightControlMessage({
        jsonrpc: "2.0",
        method: "moonlight.event",
        params: {
          seq: 5,
          monotonicMs: 1400,
          event: {
            name: "quality.sample",
            sample: { seq: 46, sampledAtMs: 1400, lossFraction: 1.2 },
          },
        },
      }),
    ).toThrow()
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

  it("decodes runtime command result events with optional diagnostic reasons", () => {
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
          status: "failed",
          reason: "decode-stall",
        },
      },
    }) as MoonlightControlEventEnvelope

    expect(decoded.params.event.name).toBe("runtime.commandResult")
    if (decoded.params.event.name === "runtime.commandResult") {
      expect(decoded.params.event.reason).toBe("decode-stall")
    }
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

  it("decodes input touch bounds commands and local apply results", () => {
    const request = decodeMoonlightControlCommandRequest({
      jsonrpc: "2.0",
      id: "input-1",
      method: "input.setTouchBounds",
      params: { x: 120, y: 0, w: 960, h: 720 },
    })
    const response = expectSuccessResponse(
      decodeMoonlightControlResponse({
        jsonrpc: "2.0",
        id: "input-1",
        result: {
          _tag: "input.command.result",
          requestId: "input-1",
          command: "input.setTouchBounds",
          status: "applied",
        },
      }),
    )

    expect(request.method).toBe("input.setTouchBounds")
    expect(response.result._tag).toBe("input.command.result")
    if (response.result._tag === "input.command.result") {
      expect(response.result.status).toBe("applied")
    }
  })

  it("decodes input command result events", () => {
    const decoded = decodeMoonlightControlMessage({
      jsonrpc: "2.0",
      method: "moonlight.event",
      params: {
        seq: 3,
        monotonicMs: 140,
        event: {
          name: "input.commandResult",
          requestId: "input-1",
          command: "input.setTouchBounds",
          status: "disabled",
        },
      },
    }) as MoonlightControlEventEnvelope

    expect(decoded.params.event.name).toBe("input.commandResult")
    if (
      decoded.params.event.name === "input.commandResult" &&
      "status" in decoded.params.event
    ) {
      expect(decoded.params.event.status).toBe("disabled")
    }
  })

  it("rejects command values outside v1 bounds before native dispatch", () => {
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

    expect(() =>
      decodeMoonlightControlCommandRequest({
        jsonrpc: "2.0",
        id: "input-2",
        method: "input.setTouchBounds",
        params: { x: 0, y: 0, w: 0, h: 720 },
      }),
    ).toThrow(/w/)
  })
})

function expectSuccessResponse(
  response: ReturnType<typeof decodeMoonlightControlResponse>,
): MoonlightControlSuccessResponse {
  if ("result" in response) return response
  throw new Error(`Expected success response, got ${response.error.message}`)
}
