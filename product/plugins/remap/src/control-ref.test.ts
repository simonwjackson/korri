import { describe, expect, it } from "bun:test"
import { parseControlRef } from "./control-ref"

describe("Remap control refs", () => {
  it("parses controller source refs for fixed player slots", () => {
    expect(parseControlRef("p1.dpad.down")).toEqual({
      kind: "controller",
      player: "p1",
      control: { kind: "dpad", direction: "down" },
      ref: "p1.dpad.down",
    })
    expect(parseControlRef("p2.button.south")).toEqual({
      kind: "controller",
      player: "p2",
      control: { kind: "button", button: "south" },
      ref: "p2.button.south",
    })
  })

  it("parses controller stick direction refs", () => {
    expect(parseControlRef("p3.stick.left.up")).toEqual({
      kind: "controller",
      player: "p3",
      control: { kind: "stick", stick: "left", direction: "up" },
      ref: "p3.stick.left.up",
    })
  })

  it("parses keyboard target refs and canonicalizes arrows", () => {
    expect(parseControlRef("key.down")).toEqual({
      kind: "keyboard",
      key: "arrow-down",
      ref: "key.down",
    })
    expect(parseControlRef("key.enter")).toEqual({
      kind: "keyboard",
      key: "enter",
      ref: "key.enter",
    })
  })

  it("rejects arbitrary player slots, unknown namespaces, and malformed refs", () => {
    expect(() => parseControlRef("p5.dpad.down")).toThrow(/player slot/)
    expect(() => parseControlRef("controller.dpad.down")).toThrow(/namespace/)
    expect(() => parseControlRef("p1.button.face.south")).toThrow(/Malformed/)
    expect(() => parseControlRef("key.arrowDown")).toThrow(/kebab-case/)
  })
})
