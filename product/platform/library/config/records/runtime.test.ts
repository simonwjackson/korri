import { describe, expect, it } from "bun:test"

import { decodeRuntimePayload } from "./runtime"

describe("RuntimePayload", () => {
  it("decodes Steam-facing runtime metadata with an absolute path", () => {
    expect(
      decodeRuntimePayload({
        kind: "tool",
        path: "/steam/compatibilitytools.d/proton-arm64",
        title: "Proton ARM64",
        tool: "proton-arm64",
      }),
    ).toEqual({
      kind: "tool",
      path: "/steam/compatibilitytools.d/proton-arm64",
      title: "Proton ARM64",
      tool: "proton-arm64",
    })
  })

  it("rejects relative runtime paths", () => {
    expect(() =>
      decodeRuntimePayload({ kind: "tool", path: "compat/proton" }),
    ).toThrow(/absolute/)
  })
})
