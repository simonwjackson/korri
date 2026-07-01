import { describe, expect, it } from "bun:test"

import type { RuntimeConfig } from "../desktop/runtime-config-shape"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"

describe("buildSpatialNavigationConfig", () => {
  it("emits native input config when desktop input is enabled with an inputd URL", () => {
    const runtime: RuntimeConfig = {
      desktopInput: true,
      nativeInputdUrl: "ws://127.0.0.1:3002",
    }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: {
        profile: "auto",
        native: { url: "ws://127.0.0.1:3002" },
        desktop: undefined,
      },
    })
  })

  it("omits native and desktop input when desktop input is disabled", () => {
    const runtime: RuntimeConfig = { desktopInput: false }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: { profile: "auto", native: undefined, desktop: undefined },
    })
  })

  it("fails closed when desktopInput is true but no inputd URL is available", () => {
    const runtime: RuntimeConfig = { desktopInput: true }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: { profile: "auto", native: undefined, desktop: undefined },
    })
  })

  it("propagates the controller profile", () => {
    const runtime: RuntimeConfig = { desktopInput: false }
    expect(buildSpatialNavigationConfig(runtime, "web").controller).toEqual({
      profile: "web",
      native: undefined,
      desktop: undefined,
    })
    expect(buildSpatialNavigationConfig(runtime, "native").controller).toEqual({
      profile: "native",
      native: undefined,
      desktop: undefined,
    })
    expect(
      buildSpatialNavigationConfig(runtime, "debug-both").controller,
    ).toEqual({ profile: "debug-both", native: undefined, desktop: undefined })
  })
})
