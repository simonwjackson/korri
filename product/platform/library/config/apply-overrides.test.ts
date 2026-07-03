import { describe, expect, it } from "bun:test"

import {
  applyArgsOverrides,
  deepMergeConfig,
  parseConfigFragment,
} from "./apply-overrides"

describe("applyArgsOverrides", () => {
  const base = {
    leading: ["--no-gui"],
    routed: ["--fullscreen"],
    middle: ["--config", "/p.yml"],
    trailing: ["/games/game"],
  } as const

  it("returns leading + routed + middle + trailing unchanged when no overrides", () => {
    expect(applyArgsOverrides(base)).toEqual([
      "--no-gui",
      "--fullscreen",
      "--config",
      "/p.yml",
      "/games/game",
    ])
  })

  it("inserts prepend before routed and append before the trailing positional (after middle)", () => {
    expect(
      applyArgsOverrides({
        ...base,
        overrides: { prepend: ["--pre"], append: ["--post"] },
      }),
    ).toEqual([
      "--no-gui",
      "--pre",
      "--fullscreen",
      "--config",
      "/p.yml",
      "--post",
      "/games/game",
    ])
  })

  it("replace swaps only the routed segment, never leading, middle, or trailing", () => {
    expect(
      applyArgsOverrides({ ...base, overrides: { replace: ["--custom"] } }),
    ).toEqual(["--no-gui", "--custom", "--config", "/p.yml", "/games/game"])
  })

  it("composes replace + prepend + append in the correct order", () => {
    expect(
      applyArgsOverrides({
        ...base,
        overrides: {
          prepend: ["--pre"],
          replace: ["--custom"],
          append: ["--post"],
        },
      }),
    ).toEqual([
      "--no-gui",
      "--pre",
      "--custom",
      "--config",
      "/p.yml",
      "--post",
      "/games/game",
    ])
  })

  it("supports an empty middle (append lands directly before trailing)", () => {
    expect(
      applyArgsOverrides({
        leading: ["--no-gui", "--root-data-dir", "/r"],
        routed: ["--fullscreen"],
        trailing: ["/games/game"],
        overrides: { append: ["--post"] },
      }),
    ).toEqual([
      "--no-gui",
      "--root-data-dir",
      "/r",
      "--fullscreen",
      "--post",
      "/games/game",
    ])
  })
})

describe("deepMergeConfig", () => {
  it("deep-merges nested objects with patch winning on scalar conflicts", () => {
    expect(
      deepMergeConfig(
        { Core: { a: 1, b: 2 }, keep: true },
        { Core: { b: 3, c: 4 } },
      ),
    ).toEqual({ Core: { a: 1, b: 3, c: 4 }, keep: true })
  })

  it("replaces arrays wholesale rather than element-merging", () => {
    expect(deepMergeConfig({ list: [1, 2, 3] }, { list: [9] })).toEqual({
      list: [9],
    })
  })
})

describe("parseConfigFragment", () => {
  it("parses a JSON object fragment", () => {
    expect(parseConfigFragment('{ "a": 1 }', JSON.parse)).toEqual({ a: 1 })
  })

  it("returns undefined for empty/whitespace text", () => {
    expect(parseConfigFragment("  ", JSON.parse)).toBeUndefined()
  })

  it("returns undefined when the fragment is not an object", () => {
    expect(parseConfigFragment("42", JSON.parse)).toBeUndefined()
  })
})
