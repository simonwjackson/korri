import { describe, expect, it } from "bun:test"
import { parse } from "yaml"
import { renderConfigYaml } from "./config-render"
import {
  RPCS3_POPUP_INI_KEYS,
  RPCS3_POPUP_INI_SECTION,
  routeSettings,
} from "./mapping"

describe("routeSettings", () => {
  it("routes Phase 1 video/audio settings to config with translated values", () => {
    const routed = routeSettings({
      video: {
        resolution: "1280x720",
        aspectRatio: "16:9",
        frameLimit: 60,
        vsync: false,
      },
      audio: { volume: 80, device: "@@@default@@@" },
    })

    expect(routed.flags).toEqual([])
    expect(routed.iniEntries).toEqual([])
    expect(routed.configEntries).toEqual([
      ["Video.Resolution", "1280x720"],
      ["Video.Aspect ratio", "16:9"],
      ["Video.Frame limit", "60"],
      ["Video.VSync Mode", "Disabled"],
      ["Audio.Master Volume", 80],
      ["Audio.Audio Device", "@@@default@@@"],
    ])
  })

  it("translates vsync true to Full and named frame limits to RPCS3 strings", () => {
    expect(routeSettings({ video: { vsync: true } }).configEntries).toEqual([
      ["Video.VSync Mode", "Full"],
    ])
    expect(
      routeSettings({ video: { frameLimit: "native" } }).configEntries,
    ).toEqual([["Video.Frame limit", "PS3 Native"]])
    expect(
      routeSettings({ video: { frameLimit: "auto" } }).configEntries,
    ).toEqual([["Video.Frame limit", "Auto"]])
  })

  it("materializes fullscreen as a flag AND config, with false written to config", () => {
    const on = routeSettings({ video: { fullscreen: true } })
    expect(on.flags).toEqual(["--fullscreen"])
    expect(on.configEntries).toEqual([
      ["Miscellaneous.Start games in fullscreen mode", true],
    ])

    const off = routeSettings({ video: { fullscreen: false } })
    expect(off.flags).toEqual([])
    expect(off.configEntries).toEqual([
      ["Miscellaneous.Start games in fullscreen mode", false],
    ])
  })

  it("routes boot essentials to flags and Miscellaneous config", () => {
    const routed = routeSettings({
      boot: { headless: true, exitOnFinish: true, autoStart: false },
    })
    expect(routed.flags).toEqual(["--headless"])
    expect(routed.configEntries).toEqual([
      ["Miscellaneous.Exit RPCS3 when process finishes", true],
      ["Miscellaneous.Automatically start games after boot", false],
    ])
  })

  it("expands suppressPopups into the full main_window ini key set = false", () => {
    const routed = routeSettings({ boot: { suppressPopups: true } })
    expect(routed.flags).toEqual([])
    expect(routed.configEntries).toEqual([])
    expect(routed.iniEntries).toEqual(
      RPCS3_POPUP_INI_KEYS.map(key => [RPCS3_POPUP_INI_SECTION, key, false]),
    )
  })

  it("routes Phase 2 power-user settings to their config keys with value maps", () => {
    expect(
      routeSettings({
        video: {
          renderer: "vulkan",
          resolutionScale: 150,
          anisotropicFilter: 16,
          shaderMode: "async-interpreter",
        },
      }).configEntries,
    ).toEqual([
      ["Video.Renderer", "Vulkan"],
      ["Video.Resolution Scale", 150],
      ["Video.Anisotropic Filter Override", 16],
      ["Video.Shader Mode", "Async Recompiler with Shader Interpreter"],
    ])

    expect(
      routeSettings({ audio: { backend: "faudio", format: "surround-5.1" } })
        .configEntries,
    ).toEqual([
      ["Audio.Renderer", "FAudio"],
      ["Audio.Audio Format", "Surround 5.1"],
    ])

    expect(
      routeSettings({ system: { language: "en-US", licenseArea: "europe" } })
        .configEntries,
    ).toEqual([
      ["System.Language", "English (US)"],
      ["System.License Area", "SCEE"],
    ])
  })

  it("routes Phase 3 core accuracy settings with verified value maps", () => {
    expect(
      routeSettings({
        core: {
          ppuDecoder: "llvm-recompiler",
          spuDecoder: "asmjit-recompiler",
          spuBlockSize: "mega",
          spuXFloatAccuracy: "approximate",
          preferredSpuThreads: 2,
          clocksScale: 150,
          librariesControl: ["libfoo.sprx:lle"],
        },
      }).configEntries,
    ).toEqual([
      ["Core.PPU Decoder", "Recompiler (LLVM)"],
      ["Core.SPU Decoder", "Recompiler (ASMJIT)"],
      ["Core.SPU Block Size", "Mega"],
      ["Core.SPU XFloat Accuracy", "Approximate"],
      ["Core.Preferred SPU Threads", 2],
      ["Core.Clocks scale", 150],
      ["Core.Libraries Control", ["libfoo.sprx:lle"]],
    ])
  })

  it("routes Phase 3 GPU accuracy toggles as booleans and MSAA via value map", () => {
    expect(
      routeSettings({
        video: {
          writeColorBuffers: true,
          writeDepthBuffer: false,
          readColorBuffers: true,
          strictRendering: true,
          disableZcull: false,
          msaa: "disabled",
        },
      }).configEntries,
    ).toEqual([
      ["Video.Write Color Buffers", true],
      ["Video.Write Depth Buffer", false],
      ["Video.Read Color Buffers", true],
      ["Video.Strict Rendering Mode", true],
      ["Video.Disable ZCull Occlusion Queries", false],
      ["Video.MSAA", "Disabled"],
    ])
  })

  it("round-trips a mixed core+video policy through renderConfigYaml", () => {
    const routed = routeSettings({
      core: {
        spuBlockSize: "giga",
        librariesControl: ["liblv2.sprx:lle", "libsysmodule.sprx:hle"],
      },
      video: { strictRendering: true },
    })
    expect(
      parse(renderConfigYaml({ entries: routed.configEntries }) as string),
    ).toEqual({
      Core: {
        "SPU Block Size": "Giga",
        "Libraries Control": ["liblv2.sprx:lle", "libsysmodule.sprx:hle"],
      },
      Video: { "Strict Rendering Mode": true },
    })
  })

  it("contributes nothing for an empty or group-less policy", () => {
    expect(routeSettings({})).toEqual({
      flags: [],
      configEntries: [],
      iniEntries: [],
    })
    expect(routeSettings({ state: { root: "/x" } })).toEqual({
      flags: [],
      configEntries: [],
      iniEntries: [],
    })
  })
})
