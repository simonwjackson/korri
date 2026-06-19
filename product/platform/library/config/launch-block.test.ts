import { describe, expect, it } from "bun:test"

import {
  collectLayerLaunchDiagnostics,
  decodeLaunchBlock,
  launchAppOrLegacy,
} from "./launch-block"

describe("LaunchBlock", () => {
  it("decodes app/module/settings and preserves boolean scalar settings", () => {
    const decoded = decodeLaunchBlock({
      app: "retroarch",
      module: "fake08",
      settings: { video_scale_integer: true, runahead_frames: 0 },
      args: ["--verbose"],
      env: { SDL_AUDIODRIVER: "pipewire" },
      cwd: "/storage/roms",
    })

    expect(decoded).toEqual({
      app: "retroarch",
      module: "fake08",
      settings: { video_scale_integer: true, runahead_frames: 0 },
      args: ["--verbose"],
      env: { SDL_AUDIODRIVER: "pipewire" },
      cwd: "/storage/roms",
    })
  })

  it("rejects typo keys under launch", () => {
    expect(() =>
      decodeLaunchBlock({ app: "retroarch", moduel: "fake08" }),
    ).toThrow()
  })

  it("decodes nested settings packs", () => {
    expect(
      decodeLaunchBlock({ settings: { display: { fullscreen: true } } }),
    ).toMatchObject({ settings: { display: { fullscreen: true } } })
  })

  it("prefers launch.app over the legacy launcher alias", () => {
    expect(
      launchAppOrLegacy({ launch: { app: "retroarch" }, launcher: "mame" }),
    ).toBe("retroarch")
  })

  it("emits an alias conflict diagnostic without blocking decode", () => {
    const diagnostics = collectLayerLaunchDiagnostics("systems.pico8", {
      launch: { app: "retroarch", module: "fake08" },
      launcher: "mame",
      core: "legacy-core",
    })

    expect(diagnostics.map(d => d._tag)).toEqual([
      "LaunchAliasConflict",
      "LaunchAliasConflict",
    ])
  })
})
