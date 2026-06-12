import { describe, expect, it } from "bun:test"

import { decodeAppChoice } from "./app-choice"

describe("AppChoice", () => {
  it("decodes id-reference choices with optional runtime and policy fields", () => {
    expect(decodeAppChoice({ id: "retroarch" })).toEqual({ id: "retroarch" })
    expect(
      decodeAppChoice({
        id: "retroarch",
        runtime: "mgba",
        inherit: false,
        gamescope: { enable: false },
        env: { LANG: "C" },
        argsAppend: ["--verbose"],
        patches: ["/patches/game.ips"],
      }),
    ).toEqual({
      id: "retroarch",
      runtime: "mgba",
      inherit: false,
      gamescope: { enable: false },
      env: { LANG: "C" },
      argsAppend: ["--verbose"],
      patches: ["/patches/game.ips"],
    })
  })

  it("rejects inline app kinds and unknown keys", () => {
    expect(() =>
      decodeAppChoice({ id: "retroarch", kind: "retroarch" }),
    ).toThrow(/kind.*top-level apps/i)
    expect(() => decodeAppChoice({ id: "retroarch", extra: true })).toThrow()
  })

  it("rejects empty id and runtime values", () => {
    expect(() => decodeAppChoice({ id: "" })).toThrow(/non-empty/)
    expect(() => decodeAppChoice({ id: "retroarch", runtime: "" })).toThrow(
      /non-empty/,
    )
  })
})
