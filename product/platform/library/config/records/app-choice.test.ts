import { describe, expect, it } from "bun:test"

import { decodeAppChoice } from "./app-choice"

const steamProvider = "@korri:steam"

const steamPluginPolicy = {
  state: { root: "{storage:@korri:steam/steam}/Steam" },
  extra: { args: ["-silent", "-gamepadui"] },
  "launch-options": "wrapper -- %command%",
}

describe("AppChoice", () => {
  it("decodes id-reference choices with optional runtime and policy fields", () => {
    expect(decodeAppChoice({ id: "retroarch" })).toEqual({ id: "retroarch" })
    expect(
      decodeAppChoice({
        id: "retroarch",
        runtime: "mgba",
        inherit: false,
        launch: { with: { "@example:wrapper": { enable: false } } },
        plugin: { "@korri:retroarch": { extraArgs: ["--verbose"] } },
        env: { LANG: "C" },
        argsAppend: ["--verbose"],
        patches: ["/patches/game.ips"],
      }),
    ).toEqual({
      id: "retroarch",
      runtime: "mgba",
      inherit: false,
      launch: { with: { "@example:wrapper": { enable: false } } },
      plugin: { "@korri:retroarch": { extraArgs: ["--verbose"] } },
      env: { LANG: "C" },
      argsAppend: ["--verbose"],
      patches: ["/patches/game.ips"],
    })
  })

  it("decodes Steam app-choice overrides as plugin payload", () => {
    expect(
      decodeAppChoice({
        id: "@korri:steam/steam",
        runtime: "proton-arm64",
        plugin: { [steamProvider]: steamPluginPolicy },
      }),
    ).toEqual({
      id: "@korri:steam/steam",
      runtime: "proton-arm64",
      plugin: { [steamProvider]: steamPluginPolicy },
    })
  })

  it("rejects inline app kinds and retired Steam top-level fields", () => {
    expect(() =>
      decodeAppChoice({ id: "retroarch", kind: "retroarch" }),
    ).toThrow(/kind.*top-level apps/i)
    expect(() =>
      decodeAppChoice({ id: "@korri:steam/steam", extra: true }),
    ).toThrow()
    expect(() =>
      decodeAppChoice({
        id: "@korri:steam/steam",
        "launch-options": "%command%",
      }),
    ).toThrow()
    expect(() =>
      decodeAppChoice({ id: "retroarch", wrapper: { enable: true } }),
    ).toThrow()
  })

  it("rejects empty id and runtime values", () => {
    expect(() => decodeAppChoice({ id: "" })).toThrow(/non-empty/)
    expect(() => decodeAppChoice({ id: "retroarch", runtime: "" })).toThrow(
      /non-empty/,
    )
  })
})
