import { describe, expect, it } from "bun:test"

import type { RuntimeConfig } from "../desktop/runtime-config-shape"
import { buildSpatialNavigationConfig } from "./spatial-navigation-config"

describe("buildSpatialNavigationConfig", () => {
  it("emits a desktop bridge config when desktop input is enabled", () => {
    const runtime: RuntimeConfig = { desktopInput: true }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: {
        profile: "auto",
        desktop: {},
      },
    })
  })

  it("omits desktop input when desktop input is disabled", () => {
    const runtime: RuntimeConfig = { desktopInput: false }
    expect(buildSpatialNavigationConfig(runtime, "auto")).toEqual({
      diagnostics: true,
      controller: { profile: "auto", desktop: undefined },
    })
  })

  it("propagates the controller profile", () => {
    const runtime: RuntimeConfig = { desktopInput: false }
    expect(buildSpatialNavigationConfig(runtime, "web").controller).toEqual({
      profile: "web",
      desktop: undefined,
    })
    expect(buildSpatialNavigationConfig(runtime, "native").controller).toEqual({
      profile: "native",
      desktop: undefined,
    })
    expect(
      buildSpatialNavigationConfig(runtime, "debug-both").controller,
    ).toEqual({ profile: "debug-both", desktop: undefined })
  })
})
