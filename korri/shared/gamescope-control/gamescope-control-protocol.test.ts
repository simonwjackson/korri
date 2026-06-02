import { describe, expect, it } from "bun:test"
import {
  createGamescopeHelloResult,
  decodeGamescopeControlEventEnvelope,
  decodeGamescopeControlRequest,
  filterToGamescopeValue,
  GAMESCOPE_CONTROL_PROTOCOL,
  GAMESCOPE_CONTROL_PROTOCOL_LIMITS,
  parseGamescopeCardinalProperty,
  validateGamescopeMode,
  valueToGamescopeFilter,
} from "./gamescope-control-protocol"

describe("gamescope control protocol", () => {
  it("describes the v1 protocol and known Gamescope scaler values", () => {
    expect(GAMESCOPE_CONTROL_PROTOCOL).toEqual({
      name: "gamescope.korri-control",
      major: 1,
      minor: 1,
    })
    expect(filterToGamescopeValue("linear")).toBe(0)
    expect(filterToGamescopeValue("nearest")).toBe(1)
    expect(filterToGamescopeValue("integer")).toBe(2)
    expect(filterToGamescopeValue("fsr")).toBe(3)
    expect(filterToGamescopeValue("nis")).toBe(4)
    expect(valueToGamescopeFilter(3)).toBe("fsr")
  })

  it("advertises all callable methods separately from mutating commands", () => {
    const hello = createGamescopeHelloResult()

    expect(hello.capabilities.methods).toContain("protocol.hello")
    expect(hello.capabilities.methods).toContain("state.get")
    expect(hello.capabilities.methods).toContain("events.subscribe")
    expect(hello.capabilities.commands).toContain("mode.set")
    expect(hello.capabilities.commands).not.toContain("state.get")
  })

  it("validates positive mode requests before they reach xprop", () => {
    expect(validateGamescopeMode({ width: 960, height: 540 })).toEqual({
      width: 960,
      height: 540,
      allowSuperRes: false,
    })
    expect(validateGamescopeMode({ width: 1, height: 1 })).toEqual({
      width: 1,
      height: 1,
      allowSuperRes: false,
    })
    expect(() => validateGamescopeMode({ width: 0, height: 540 })).toThrow(
      String(GAMESCOPE_CONTROL_PROTOCOL_LIMITS.mode.width.min),
    )
    expect(() => validateGamescopeMode({ width: 960.5, height: 540 })).toThrow(
      "integer",
    )
  })

  it("decodes JSON-RPC requests, including valid unsupported commands, and rejects unknown methods", () => {
    expect(
      decodeGamescopeControlRequest({
        jsonrpc: "2.0",
        id: "1",
        method: "mode.set",
        params: { width: 960, height: 540 },
      }),
    ).toEqual({
      jsonrpc: "2.0",
      id: "1",
      method: "mode.set",
      params: { width: 960, height: 540, allowSuperRes: false },
    })

    expect(
      decodeGamescopeControlRequest({
        jsonrpc: "2.0",
        id: "2",
        method: "display.sleep",
      }),
    ).toEqual({ jsonrpc: "2.0", id: "2", method: "display.sleep" })

    expect(() =>
      decodeGamescopeControlRequest({ jsonrpc: "2.0", id: 1, method: "wat" }),
    ).toThrow("Unsupported gamescope-control method")
  })

  it("decodes event envelopes and rejects malformed event frames", () => {
    expect(
      decodeGamescopeControlEventEnvelope({
        jsonrpc: "2.0",
        method: "gamescope.event",
        params: { seq: 1, event: { type: "command.result" } },
      }),
    ).toEqual({
      jsonrpc: "2.0",
      method: "gamescope.event",
      params: { seq: 1, event: { type: "command.result" } },
    })

    expect(() => decodeGamescopeControlEventEnvelope(null)).toThrow(
      "event must be an object",
    )
    expect(() =>
      decodeGamescopeControlEventEnvelope({
        jsonrpc: "2.0",
        method: "gamescope.event",
        params: { seq: 0, event: { type: "command.result" } },
      }),
    ).toThrow("positive integer")
    expect(() =>
      decodeGamescopeControlEventEnvelope({
        jsonrpc: "2.0",
        method: "gamescope.event",
        params: { seq: 1, event: { type: "unknown" } },
      }),
    ).toThrow("Unsupported gamescope-control event")
  })

  it("parses xprop CARDINAL readback values", () => {
    expect(
      parseGamescopeCardinalProperty(
        "GAMESCOPE_FSR_FEEDBACK(CARDINAL) = 1",
        "GAMESCOPE_FSR_FEEDBACK",
      ),
    ).toBe(1)
    expect(
      parseGamescopeCardinalProperty(
        "GAMESCOPE_SCALING_FILTER:  not found.",
        "GAMESCOPE_SCALING_FILTER",
      ),
    ).toBeUndefined()
  })
})
