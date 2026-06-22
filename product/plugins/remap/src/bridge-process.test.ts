import { describe, expect, it } from "bun:test"
import { decodeRemapBindings } from "./bindings"
import { createRemapEngine } from "./bridge-process"
import { createMemoryRemapSink } from "./sinks"

describe("Remap engine", () => {
  it("maps button press and release to keyboard target events", () => {
    const sink = createMemoryRemapSink({ keyboard: true })
    const engine = createRemapEngine({
      bindings: decodeRemapBindings({ "p1.button.west": "key.z" }),
      sink,
    })

    engine.setSource("p1.button.west", true)
    engine.setSource("p1.button.west", false)

    expect(sink.events).toEqual([
      { type: "keyboard", action: "press", key: "z" },
      { type: "keyboard", action: "release", key: "z" },
    ])
  })

  it("maps button press and release to gamepad target events", () => {
    const sink = createMemoryRemapSink({ gamepad: true })
    const engine = createRemapEngine({
      bindings: decodeRemapBindings({ "p1.button.east": "p1.button.south" }),
      sink,
    })

    engine.setSource("p1.button.east", true)
    engine.setSource("p1.button.east", false)

    expect(sink.events).toEqual([
      {
        type: "gamepad",
        action: "press",
        player: "p1",
        control: { kind: "button", button: "south" },
      },
      {
        type: "gamepad",
        action: "release",
        player: "p1",
        control: { kind: "button", button: "south" },
      },
    ])
  })

  it("preserves target order for one source mapped to multiple targets", () => {
    const sink = createMemoryRemapSink({ keyboard: true, gamepad: true })
    const engine = createRemapEngine({
      bindings: decodeRemapBindings({
        "p1.button.west": ["key.z", "p1.button.south"],
      }),
      sink,
    })

    engine.setSource("p1.button.west", true)
    engine.setSource("p1.button.west", false)

    expect(sink.events.map(event => `${event.type}:${event.action}`)).toEqual([
      "keyboard:press",
      "gamepad:press",
      "keyboard:release",
      "gamepad:release",
    ])
  })

  it("keeps shared targets pressed until all active sources release", () => {
    const sink = createMemoryRemapSink({ keyboard: true })
    const engine = createRemapEngine({
      bindings: decodeRemapBindings({
        "p1.button.west": "key.z",
        "p1.button.south": "key.z",
      }),
      sink,
    })

    engine.setSource("p1.button.west", true)
    engine.setSource("p1.button.south", true)
    engine.setSource("p1.button.west", false)
    engine.setSource("p1.button.south", false)

    expect(sink.events).toEqual([
      { type: "keyboard", action: "press", key: "z" },
      { type: "keyboard", action: "release", key: "z" },
    ])
  })

  it("releases the old stick direction before pressing a new direction", () => {
    const sink = createMemoryRemapSink({ keyboard: true })
    const engine = createRemapEngine({
      bindings: decodeRemapBindings({
        "p1.stick.left.up": "key.up",
        "p1.stick.left.down": "key.down",
      }),
      sink,
    })

    engine.setSource("p1.stick.left.up", true)
    engine.setSource("p1.stick.left.down", true)

    expect(sink.events).toEqual([
      { type: "keyboard", action: "press", key: "arrow-up" },
      { type: "keyboard", action: "release", key: "arrow-up" },
      { type: "keyboard", action: "press", key: "arrow-down" },
    ])
  })

  it("releaseAll releases every held keyboard and gamepad target", () => {
    const sink = createMemoryRemapSink({ keyboard: true, gamepad: true })
    const engine = createRemapEngine({
      bindings: decodeRemapBindings({
        "p1.button.west": "key.z",
        "p1.button.east": "p1.button.south",
      }),
      sink,
    })

    engine.setSource("p1.button.west", true)
    engine.setSource("p1.button.east", true)
    engine.releaseAll()

    expect(sink.events).toEqual([
      { type: "keyboard", action: "press", key: "z" },
      {
        type: "gamepad",
        action: "press",
        player: "p1",
        control: { kind: "button", button: "south" },
      },
      { type: "keyboard", action: "release", key: "z" },
      {
        type: "gamepad",
        action: "release",
        player: "p1",
        control: { kind: "button", button: "south" },
      },
    ])
  })
})
