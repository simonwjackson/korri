import { describe, expect, it } from "bun:test"
import { createMemoryRemapSink, validateSinkCapabilities } from "./sinks"
import { parseControlRef } from "./control-ref"

describe("Remap sinks", () => {
  it("accepts keyboard and gamepad targets when supported", () => {
    expect(() =>
      validateSinkCapabilities(
        createMemoryRemapSink({ keyboard: true, gamepad: true }),
        [parseControlRef("key.z"), parseControlRef("p1.button.south")],
      ),
    ).not.toThrow()
  })

  it("fails before launch when a keyboard target is requested on a gamepad-only sink", () => {
    expect(() =>
      validateSinkCapabilities(createMemoryRemapSink({ gamepad: true }), [
        parseControlRef("key.z"),
      ]),
    ).toThrow(/keyboard target.*not supported/)
  })

  it("fails before launch when a gamepad target is requested on a keyboard-only sink", () => {
    expect(() =>
      validateSinkCapabilities(createMemoryRemapSink({ keyboard: true }), [
        parseControlRef("p1.button.south"),
      ]),
    ).toThrow(/gamepad target.*not supported/)
  })
})
