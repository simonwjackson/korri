import { describe, expect, it } from "bun:test"
import { runForegroundSessionStatusCommand } from "./foreground-session-status"

describe("foreground session status CLI", () => {
  it("prints normalized JSON for a valid status snapshot", async () => {
    const lines: string[] = []
    const exitCode = await runForegroundSessionStatusCommand(
      ["--url", "http://desktop/status"],
      {
        fetch: async url => {
          expect(url).toBe("http://desktop/status")
          return new Response(
            JSON.stringify({
              schemaVersion: 1,
              serverTimestamp: "2026-05-26T12:00:00.000Z",
              state: "IdleReady",
              recentEvents: [],
            }),
            { status: 200 },
          )
        },
        write: line => lines.push(line),
      },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "IdleReady",
      recentEvents: [],
    })
  })

  it("prints help to stdout with a success exit", async () => {
    const lines: string[] = []
    const errors: string[] = []

    const exitCode = await runForegroundSessionStatusCommand(["--help"], {
      write: line => lines.push(line),
      writeError: line => errors.push(line),
    })

    expect(exitCode).toBe(0)
    expect(lines.join("\n")).toContain("usage:")
    expect(errors).toEqual([])
  })

  it("returns usage when --url has no value", async () => {
    const errors: string[] = []
    const exitCode = await runForegroundSessionStatusCommand(["--url"], {
      writeError: line => errors.push(line),
    })

    expect(exitCode).toBe(2)
    expect(errors.join("\n")).toContain("--url requires a value")
  })

  it("returns non-zero on HTTP failures", async () => {
    const errors: string[] = []
    const exitCode = await runForegroundSessionStatusCommand([], {
      fetch: async () => new Response("nope", { status: 503 }),
      writeError: line => errors.push(line),
    })

    expect(exitCode).toBe(20)
    expect(errors.join("\n")).toContain("HTTP 503")
  })

  it("returns non-zero on network failure", async () => {
    const errors: string[] = []
    const exitCode = await runForegroundSessionStatusCommand([], {
      fetch: async () => {
        throw new Error("connection refused")
      },
      writeError: line => errors.push(line),
    })

    expect(exitCode).toBe(20)
    expect(errors.join("\n")).toContain("connection refused")
  })

  it("returns non-zero on invalid status schema", async () => {
    const errors: string[] = []
    const exitCode = await runForegroundSessionStatusCommand([], {
      fetch: async () =>
        new Response(JSON.stringify({ state: "IdleReady" }), { status: 200 }),
      writeError: line => errors.push(line),
    })

    expect(exitCode).toBe(30)
    expect(errors.join("\n")).toContain("status schema")
  })
})
