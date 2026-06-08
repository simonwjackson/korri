import { describe, expect, it } from "bun:test"

import {
  composeRetroArchLaunchSpec,
  renderRetroArchConfig,
} from "./retroarch-launch-spec"

describe("typed RetroArch launch spec rendering", () => {
  it("renders minimal argv and safe generated config defaults", () => {
    const spec = composeRetroArchLaunchSpec({
      facts: {
        configPath: "/tmp/launch/retroarch.cfg",
        corePath: "/cores/mgba_libretro.so",
        contentPath: "/games/gba/SMA.gba",
      },
    })

    expect(spec).toEqual({
      command: "retroarch",
      args: [
        "-c",
        "/tmp/launch/retroarch.cfg",
        "-L",
        "/cores/mgba_libretro.so",
        "/games/gba/SMA.gba",
      ],
    })
    expect(renderRetroArchConfig()).toContain('config_save_on_exit = "false"')
    expect(renderRetroArchConfig()).toContain('auto_overrides_enable = "false"')
    expect(renderRetroArchConfig()).toContain('auto_remaps_enable = "false"')
    expect(renderRetroArchConfig()).toContain('game_specific_options = "false"')
    expect(renderRetroArchConfig()).toContain('auto_shaders_enable = "false"')
  })

  it("renders typed settings before extraSettings so escape hatches win", () => {
    const config = renderRetroArchConfig({
      lifecycle: { saveOnExit: false },
      paths: {
        systemDirectory: "/bios",
        savefileDirectory: "/saves",
        savestateDirectory: "/states",
        screenshotDirectory: "/screenshots",
      },
      video: {
        fullscreen: true,
        windowedFullscreen: true,
        vsync: true,
        aspectRatio: "core-provided",
      },
      audio: { enable: true, latencyMs: 64 },
      input: {
        autodetect: true,
        maxUsers: 4,
        menuToggleGamepadCombo: "start-select",
      },
      extraSettings: {
        video_fullscreen: false,
        notification_show_autoconfig: false,
      },
    })

    expect(config).toContain('system_directory = "/bios"')
    expect(config).toContain('video_fullscreen = "true"')
    expect(config).toContain("aspect_ratio_index = 22")
    expect(config).toContain("audio_latency = 64")
    expect(config).toContain("input_menu_toggle_gamepad_combo = 3")
    expect(config.lastIndexOf('video_fullscreen = "false"')).toBeGreaterThan(
      config.indexOf('video_fullscreen = "true"'),
    )
  })

  it("renders logging appendconfig extraArgs and environment unsets", () => {
    const spec = composeRetroArchLaunchSpec({
      command: "/run/current-system/sw/bin/retroarch",
      policy: {
        environment: { WAYLAND_DISPLAY: null, SDL_VIDEODRIVER: "x11" },
        logging: { verbose: true, logFile: "/tmp/retroarch.log" },
        configFile: { append: ["/tmp/a.cfg", "/tmp/b.cfg"] },
        extraArgs: ["--features"],
      },
      facts: {
        configPath: "/tmp/launch/retroarch.cfg",
        corePath: "/cores/mgba_libretro.so",
        contentPath: "/games/gba/SMA.gba",
      },
    })

    expect(spec).toEqual({
      command: "/run/current-system/sw/bin/retroarch",
      args: [
        "-v",
        "--log-file=/tmp/retroarch.log",
        "-c",
        "/tmp/launch/retroarch.cfg",
        "--appendconfig=/tmp/a.cfg|/tmp/b.cfg",
        "-L",
        "/cores/mgba_libretro.so",
        "--features",
        "/games/gba/SMA.gba",
      ],
      env: { SDL_VIDEODRIVER: "x11" },
      envUnset: ["WAYLAND_DISPLAY"],
    })
  })

  it("rejects blank launch facts", () => {
    const facts = {
      configPath: "/tmp/launch/retroarch.cfg",
      corePath: "/cores/mgba_libretro.so",
      contentPath: "/games/gba/SMA.gba",
    }

    expect(() =>
      composeRetroArchLaunchSpec({ facts: { ...facts, configPath: " " } }),
    ).toThrow(/config path/)
    expect(() =>
      composeRetroArchLaunchSpec({ facts: { ...facts, corePath: "" } }),
    ).toThrow(/core path/)
    expect(() =>
      composeRetroArchLaunchSpec({ facts: { ...facts, contentPath: "" } }),
    ).toThrow(/content path/)
  })

  it("rejects extraArgs that duplicate core selection", () => {
    const facts = {
      configPath: "/tmp/launch/retroarch.cfg",
      corePath: "/cores/mgba_libretro.so",
      contentPath: "/games/gba/SMA.gba",
    }

    for (const extraArgs of [
      ["-L", "/other/core.so"],
      ["--libretro"],
      ["--libretro=/other/core.so"],
    ]) {
      expect(() =>
        composeRetroArchLaunchSpec({ policy: { extraArgs }, facts }),
      ).toThrow(/core selection/)
    }
  })
})
