import { describe, expect, it } from "bun:test"
import { Schema } from "effect"

import {
  decodeLaunchSpec,
  LaunchFailureKind,
  LaunchSpec,
  launchFailureExitCode,
} from "./launcher"

describe("LaunchSpec schema", () => {
  it("decodes a minimal valid spec", () => {
    const spec = decodeLaunchSpec({
      command: "/usr/bin/runemu.sh",
      args: ["/storage/games/snes/zelda.smc", "-Psnes"],
    })
    expect(spec.command).toBe("/usr/bin/runemu.sh")
    expect(spec.args).toEqual(["/storage/games/snes/zelda.smc", "-Psnes"])
    expect(spec.env).toBeUndefined()
    expect(spec.cwd).toBeUndefined()
  })

  it("decodes a spec with optional env and cwd", () => {
    const spec = decodeLaunchSpec({
      command: "/bin/true",
      args: [],
      env: { KORRI_FAKE_GAME_EXIT: "0", DISPLAY: ":0" },
      cwd: "/tmp",
    })
    expect(spec.env).toEqual({ KORRI_FAKE_GAME_EXIT: "0", DISPLAY: ":0" })
    expect(spec.cwd).toBe("/tmp")
  })

  it("accepts an empty args array", () => {
    const spec = decodeLaunchSpec({ command: "/bin/true", args: [] })
    expect(spec.args).toEqual([])
  })

  it("rejects an empty command", () => {
    expect(() => decodeLaunchSpec({ command: "", args: [] })).toThrow()
  })

  it("rejects a missing command", () => {
    expect(() => decodeLaunchSpec({ args: [] })).toThrow()
  })

  it("rejects non-string args", () => {
    expect(() =>
      decodeLaunchSpec({ command: "/bin/true", args: [1, 2] as unknown }),
    ).toThrow()
  })

  it("is the encoded type — round-trip equals the input", () => {
    const input = {
      command: "/bin/echo",
      args: ["a", "b"],
    } as const
    const encoded = Schema.encodeSync(LaunchSpec)(decodeLaunchSpec(input))
    expect(encoded).toEqual(input)
  })
})

describe("LaunchFailureKind schema", () => {
  it("decodes session-busy as a shared launch failure kind", () => {
    expect(Schema.decodeUnknownSync(LaunchFailureKind)("session-busy")).toBe(
      "session-busy",
    )
  })

  it("rejects unknown failure categories", () => {
    expect(() =>
      Schema.decodeUnknownSync(LaunchFailureKind)("local-session-busy"),
    ).toThrow()
  })

  it("maps session-busy to the shared exit code", () => {
    expect(launchFailureExitCode("session-busy")).toBe(121)
  })
})
