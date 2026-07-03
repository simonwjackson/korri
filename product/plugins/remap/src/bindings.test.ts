import { describe, expect, it } from "bun:test"
import { decodeRemapBindings } from "./bindings"

describe("Remap bindings", () => {
  it("decodes gamepad-to-keyboard and gamepad-to-gamepad bindings", () => {
    expect(
      decodeRemapBindings({
        "p1.button.west": "key.z",
        "p1.button.east": "p1.button.south",
      }).map(binding => ({
        source: binding.source.ref,
        targets: binding.targets.map(target => target.ref),
      })),
    ).toEqual([
      { source: "p1.button.west", targets: ["key.z"] },
      { source: "p1.button.east", targets: ["p1.button.south"] },
    ])
  })

  it("rejects empty maps and targetless arrays", () => {
    expect(() => decodeRemapBindings({})).toThrow(/at least one binding/)
    expect(() => decodeRemapBindings({ "p1.button.west": [] })).toThrow(
      /at least one target/,
    )
  })

  it("requires controller sources and controller or keyboard targets", () => {
    expect(() => decodeRemapBindings({ "key.z": "p1.button.south" })).toThrow(
      /source must be a controller/,
    )
    expect(() =>
      decodeRemapBindings({ "p1.button.west": "mouse.left" }),
    ).toThrow(/namespace/)
  })
})
