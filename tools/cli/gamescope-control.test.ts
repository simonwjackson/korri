import { describe, expect, it } from "bun:test"
import { createGamescopeHelloResult } from "@shared/gamescope-control/gamescope-control-protocol"
import { runGamescopeControlCommand } from "./gamescope-control"

describe("gamescope-control cli", () => {
  it("sets mode through the control socket", async () => {
    const output: string[] = []
    const calls: unknown[] = []
    const exitCode = await runGamescopeControlCommand(
      ["mode", "960x540", "--socket", "/tmp/gamescope.sock"],
      {
        write: line => output.push(line),
        connect: async () => ({
          hello: async () => ({
            jsonrpc: "2.0",
            id: "1",
            result: helloResult(),
          }),
          state: async () => ({
            jsonrpc: "2.0",
            id: "2",
            result: stateResult(),
          }),
          setMode: async params => {
            calls.push(params)
            return {
              jsonrpc: "2.0",
              id: "3",
              result: {
                _tag: "command.result" as const,
                command: "mode.set" as const,
                status: "applied" as const,
                requested: params,
                applied: { xwaylandMode: params },
              },
            }
          },
          setFilter: async () => {
            throw new Error("unexpected")
          },
          setSharpness: async () => {
            throw new Error("unexpected")
          },
          close: () => undefined,
        }),
      },
    )

    expect(exitCode).toBe(0)
    expect(calls).toEqual([{ width: 960, height: 540 }])
    expect(output[0]).toContain('"status": "applied"')
  })

  it("prints JSON-RPC error messages from the bridge", async () => {
    const errors: string[] = []
    const exitCode = await runGamescopeControlCommand(
      ["mode", "960x540", "--socket", "/tmp/gamescope.sock"],
      {
        writeError: line => errors.push(line),
        connect: async () => ({
          hello: async () => ({
            jsonrpc: "2.0",
            id: "1",
            result: helloResult(),
          }),
          state: async () => ({
            jsonrpc: "2.0",
            id: "2",
            result: stateResult(),
          }),
          setMode: async () => {
            throw { code: -32001, message: "xrandr timed out after 1000ms" }
          },
          setFilter: async () => {
            throw new Error("unexpected")
          },
          setSharpness: async () => {
            throw new Error("unexpected")
          },
          close: () => undefined,
        }),
      },
    )

    expect(exitCode).toBe(1)
    expect(errors.join("\n")).toContain("xrandr timed out")
  })

  it("validates sharpness before connecting", async () => {
    const errors: string[] = []
    const exitCode = await runGamescopeControlCommand(
      ["sharpness", "99", "--socket", "/tmp/gamescope.sock"],
      { writeError: line => errors.push(line) },
    )

    expect(exitCode).toBe(2)
    expect(errors.join("\n")).toContain("sharpness")
  })
})

function helloResult() {
  return createGamescopeHelloResult()
}

function stateResult() {
  return {
    _tag: "state.snapshot" as const,
    xwaylandMode: { width: 640, height: 360 },
    filter: "linear" as const,
    sharpness: 20,
    fsrFeedback: false,
  }
}
