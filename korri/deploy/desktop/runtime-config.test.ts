import { describe, expect, it } from "bun:test"

import { readRuntimeConfigFromEnv } from "./runtime-config"

describe("readRuntimeConfigFromEnv", () => {
  it("returns the configured native bridge URL", () => {
    expect(
      readRuntimeConfigFromEnv({
        KORRI_NATIVE_BRIDGE_URL: "ws://127.0.0.1:3002",
      }),
    ).toEqual({ nativeBridgeUrl: "ws://127.0.0.1:3002" })
  })

  it("returns null when the env var is unset", () => {
    expect(readRuntimeConfigFromEnv({})).toEqual({ nativeBridgeUrl: null })
  })

  it("treats an empty-string env var as unset", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_NATIVE_BRIDGE_URL: "" }),
    ).toEqual({ nativeBridgeUrl: null })
  })

  it("trims whitespace and treats whitespace-only as unset", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_NATIVE_BRIDGE_URL: "   " }),
    ).toEqual({ nativeBridgeUrl: null })
    expect(
      readRuntimeConfigFromEnv({ KORRI_NATIVE_BRIDGE_URL: " ws://x:1 " }),
    ).toEqual({ nativeBridgeUrl: "ws://x:1" })
  })

  it("ignores undefined values", () => {
    expect(
      readRuntimeConfigFromEnv({ KORRI_NATIVE_BRIDGE_URL: undefined }),
    ).toEqual({ nativeBridgeUrl: null })
  })
})
