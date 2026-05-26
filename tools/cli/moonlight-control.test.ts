import { describe, expect, it } from "bun:test"
import {
  MOONLIGHT_CONTROL_PROTOCOL,
  MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
} from "@shared/stream/moonlight-control-protocol"
import { runMoonlightControlCommand } from "./moonlight-control"

describe("moonlight-control cli", () => {
  it("prints hello JSON from a local control socket", async () => {
    const output: string[] = []
    const exitCode = await runMoonlightControlCommand(
      ["hello", "--socket", "/tmp/control.sock"],
      {
        write: line => output.push(line),
        connect: async socketPath => ({
          socketPath,
          hello: async () => helloResponse(),
          state: async () => {
            throw new Error("unexpected")
          },
          subscribe: async () => {
            throw new Error("unexpected")
          },
          onEvent: () => () => undefined,
          close: () => undefined,
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(output).toEqual([JSON.stringify(helloResponse(), null, 2)])
  })

  it("prints state JSON from a local control socket", async () => {
    const output: string[] = []
    const exitCode = await runMoonlightControlCommand(
      ["state", "--socket", "/tmp/control.sock"],
      {
        write: line => output.push(line),
        connect: async socketPath => ({
          socketPath,
          hello: async () => {
            throw new Error("unexpected")
          },
          state: async () => stateResponse(),
          subscribe: async () => {
            throw new Error("unexpected")
          },
          onEvent: () => () => undefined,
          close: () => undefined,
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(output[0]).toContain("state.snapshot")
  })

  it("returns a diagnostic when connection fails", async () => {
    const errors: string[] = []
    const exitCode = await runMoonlightControlCommand(
      ["hello", "--socket", "/tmp/missing.sock"],
      {
        writeError: line => errors.push(line),
        connect: async () => {
          throw new Error("ENOENT")
        },
      },
    )

    expect(exitCode).toBe(1)
    expect(errors.join("\n")).toContain("ENOENT")
  })

  it("fails clearly when the socket flag is missing", async () => {
    const errors: string[] = []
    const exitCode = await runMoonlightControlCommand(["hello"], {
      writeError: line => errors.push(line),
    })

    expect(exitCode).toBe(2)
    expect(errors.join("\n")).toContain("--socket")
  })
})

function helloResponse() {
  return {
    jsonrpc: "2.0" as const,
    id: "1",
    result: {
      _tag: "protocol.hello" as const,
      protocol: MOONLIGHT_CONTROL_PROTOCOL,
      session: { sessionId: "session-1" },
      authority: "observer" as const,
      capabilities: { events: ["lifecycle"], commands: [], experimental: [] },
      limits: MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
    },
  }
}

function stateResponse() {
  return {
    jsonrpc: "2.0" as const,
    id: "2",
    result: {
      _tag: "state.snapshot" as const,
      seq: 1,
      session: { sessionId: "session-1", state: "streaming" as const },
      streamQuality: { connection: "unknown" as const },
      runtimeSettings: {},
      input: {
        route: "moonlight-embedded",
        status: "unknown" as const,
        capabilities: [],
      },
    },
  }
}
