import { describe, expect, it } from "bun:test"
import { readRuntimeConfigFromEnv } from "./runtime-config"

describe("readRuntimeConfigFromEnv", () => {
  it("enables desktop input bridge by default", () => {
    expect(readRuntimeConfigFromEnv({})).toEqual({ desktopInput: true })
  })

  it("can disable desktop input bridge explicitly", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_DESKTOP_INPUT_BRIDGE: "0" }),
    ).toEqual({ desktopInput: false })
  })

  it("does not expose raw inputd URLs to the renderer runtime config", () => {
    expect(
      readRuntimeConfigFromEnv({
        KORRI_NATIVE_BRIDGE_URL: "ws://127.0.0.1:3002",
      }),
    ).toEqual({ desktopInput: true })
  })
})
