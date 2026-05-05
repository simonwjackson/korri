import { describe, expect, it } from "bun:test"
import {
  isControllerInputProfile,
  resolveControllerInput,
} from "./controller-profile"

const native = { url: "ws://127.0.0.1:3002" }
const gamepad = { axisThreshold: 0.4 }

describe("resolveControllerInput", () => {
  it("uses browser gamepad for the default auto profile without native input", () => {
    expect(resolveControllerInput()).toEqual({
      gamepad: undefined,
      native: false,
    })
  })

  it("uses native input for the auto profile when native options exist", () => {
    expect(resolveControllerInput({ native })).toEqual({
      gamepad: false,
      native,
    })
  })

  it("lets the web profile override native options", () => {
    expect(resolveControllerInput({ profile: "web", native, gamepad })).toEqual(
      {
        gamepad,
        native: false,
      },
    )
  })

  it("uses native-only when the native profile has native options", () => {
    expect(resolveControllerInput({ profile: "native", native })).toEqual({
      gamepad: false,
      native,
    })
  })

  it("fails closed when the native profile has no native options", () => {
    expect(resolveControllerInput("native")).toEqual({
      gamepad: false,
      native: false,
      warning: "controller profile 'native' requires native options",
    })
  })

  it("supports explicit debug-both mode", () => {
    expect(
      resolveControllerInput({ profile: "debug-both", native, gamepad }),
    ).toEqual({
      gamepad,
      native,
    })
  })

  it("keeps web input but reports missing native input for debug-both without native options", () => {
    expect(resolveControllerInput("debug-both")).toEqual({
      gamepad: undefined,
      native: false,
      warning:
        "controller profile 'debug-both' requires native options for native input",
    })
  })

  it("can disable controller input regardless of native options", () => {
    expect(resolveControllerInput(false)).toEqual({
      gamepad: false,
      native: false,
    })
  })
})

describe("isControllerInputProfile", () => {
  it("accepts known profiles", () => {
    expect(isControllerInputProfile("auto")).toBe(true)
    expect(isControllerInputProfile("web")).toBe(true)
    expect(isControllerInputProfile("native")).toBe(true)
    expect(isControllerInputProfile("debug-both")).toBe(true)
  })

  it("rejects unknown values", () => {
    expect(isControllerInputProfile("both")).toBe(false)
    expect(isControllerInputProfile(undefined)).toBe(false)
  })
})
