import { describe, expect, it } from "bun:test"

import type { RuntimeConfigBridgeState } from "../desktop/runtime-config-bridge"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"

describe("buildSpatialNavigationConfig", () => {
  it("emits a native bridge config when runtime config has a URL", () => {
    const runtime: RuntimeConfigBridgeState = {
      nativeBridgeUrl: "ws://127.0.0.1:3002",
    }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: {
        profile: "auto",
        native: { url: "ws://127.0.0.1:3002", subscribe: ["gamepad", "system"] },
      },
    })
  })

  it("emits undefined native when runtime config has no URL", () => {
    const runtime: RuntimeConfigBridgeState = { nativeBridgeUrl: null }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: { profile: "auto", native: undefined },
    })
  })

  it("propagates the controller profile", () => {
    const runtime: RuntimeConfigBridgeState = { nativeBridgeUrl: null }
    expect(buildSpatialNavigationConfig(runtime, "web").controller).toEqual({
      profile: "web",
      native: undefined,
    })
    expect(buildSpatialNavigationConfig(runtime, "native").controller).toEqual(
      { profile: "native", native: undefined },
    )
    expect(
      buildSpatialNavigationConfig(runtime, "debug-both").controller,
    ).toEqual({ profile: "debug-both", native: undefined })
  })
})
