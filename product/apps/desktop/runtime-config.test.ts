import { describe, expect, it } from "bun:test"
import {
  desktopInputdUrlFromEnv,
  readRuntimeConfigFromEnv,
} from "./runtime-config"

describe("readRuntimeConfigFromEnv", () => {
  it("keeps desktop input bridge disabled for unconfigured host desktop", () => {
    expect(readRuntimeConfigFromEnv({})).toEqual({ desktopInput: false })
  })

  it("enables native input for the device profile", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_DESKTOP_PROFILE: "device" }),
    ).toEqual({
      desktopInput: true,
      nativeInputdUrl: "ws://127.0.0.1:3002",
    })
  })

  it("enables native input for an explicit inputd endpoint", () => {
    expect(
      readRuntimeConfigFromEnv({
        KORRI_DESKTOP_INPUTD_URL: "ws://127.0.0.1:3002",
      }),
    ).toEqual({
      desktopInput: true,
      nativeInputdUrl: "ws://127.0.0.1:3002",
    })
  })

  it("can disable desktop input bridge explicitly", () => {
    expect(
      readRuntimeConfigFromEnv({
        KORRI_DESKTOP_PROFILE: "device",
        KORRI_DESKTOP_INPUT_BRIDGE: "0",
      }),
    ).toEqual({ desktopInput: false })
  })

  it("does not expose raw legacy inputd URLs to the renderer runtime config", () => {
    expect(
      readRuntimeConfigFromEnv({
        KORRI_NATIVE_BRIDGE_URL: "ws://127.0.0.1:3002",
      }),
    ).toEqual({ desktopInput: false })
  })

  it("exposes valid live USB artifact markers", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_LIVE_USB_ARTIFACT: "product" }),
    ).toEqual({ desktopInput: false, liveUsbArtifact: "product" })
    expect(
      readRuntimeConfigFromEnv({ KORRI_LIVE_USB_ARTIFACT: "developer" }),
    ).toEqual({ desktopInput: false, liveUsbArtifact: "developer" })
  })

  it("ignores malformed live USB artifact markers", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_LIVE_USB_ARTIFACT: "diagnostic" }),
    ).toEqual({ desktopInput: false })
  })
})

describe("desktopInputdUrlFromEnv", () => {
  it("returns undefined for unconfigured host desktop", () => {
    expect(desktopInputdUrlFromEnv({})).toBeUndefined()
  })

  it("uses the loopback default for the device profile", () => {
    expect(desktopInputdUrlFromEnv({ KORRI_DESKTOP_PROFILE: "device" })).toBe(
      "ws://127.0.0.1:3002",
    )
  })

  it("prefers an explicit desktop inputd URL", () => {
    expect(
      desktopInputdUrlFromEnv({
        KORRI_DESKTOP_PROFILE: "device",
        KORRI_DESKTOP_INPUTD_URL: " ws://127.0.0.1:3999 ",
      }),
    ).toBe("ws://127.0.0.1:3999")
  })
})
