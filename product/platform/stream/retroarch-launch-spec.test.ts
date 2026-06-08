import { describe, expect, it } from "bun:test"

import {
  assertUniqueRetroArchTypedConfigKeys,
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
      lifecycle: {
        saveOnExit: false,
        showHiddenFiles: true,
        loadDummyOnCoreShutdown: false,
        historyListEnable: true,
        performanceCounters: true,
        allUsersControlMenu: false,
        suspendScreensaver: true,
        sustainedPerformanceMode: false,
        gameMode: true,
      },
      logging: {
        verbosity: true,
        libretroLogLevel: "info",
        fpsShow: true,
        memoryShow: true,
        framecountShow: true,
      },
      drivers: {
        input: "udev",
        joypad: "udev",
        video: "glcore",
        audio: "alsathread",
        resampler: "sinc",
        menu: "ozone",
        camera: "null",
        location: "null",
        record: "ffmpeg",
      },
      paths: {
        systemDirectory: "/bios",
        savefileDirectory: "/saves",
        savestateDirectory: "/states",
        screenshotDirectory: "/screenshots",
        contentDirectory: null,
        cacheDirectory: "/cache/retroarch",
        assetsDirectory: "/share/retroarch/assets",
        thumbnailsDirectory: "/data/retroarch/thumbnails",
        playlistDirectory: "/data/retroarch/playlists",
        libretroDirectory: "/lib/retroarch/cores",
        libretroInfoPath: "/share/libretro/info",
        coreAssetsDirectory: "/data/retroarch/downloads",
        coreOptionsPath: "/config/retroarch/core-options.cfg",
        joypadAutoconfigDirectory: "/share/retroarch/autoconfig",
        inputRemappingDirectory: "/config/retroarch/remaps",
        overlayDirectory: "/config/retroarch/overlays",
        videoShaderDirectory: "/share/retroarch/shaders",
        cheatDatabasePath: "/data/retroarch/cheats",
        contentDatabasePath: "/data/retroarch/database/rdb",
        contentRuntimeLog: true,
        recordingOutputDirectory: "/captures/retroarch",
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
        menu_driver: "rgui",
        cache_directory: "/override/cache",
        notification_show_autoconfig: false,
      },
    })

    expect(config).toContain('show_hidden_files = "true"')
    expect(config).toContain('log_verbosity = "true"')
    expect(config).toContain('input_driver = "udev"')
    expect(config).toContain('menu_driver = "ozone"')
    expect(config).toContain('system_directory = "/bios"')
    expect(config).toContain('cache_directory = "/cache/retroarch"')
    expect(config).not.toContain("content_directory")
    expect(config).toContain('video_fullscreen = "true"')
    expect(config).toContain("aspect_ratio_index = 22")
    expect(config).toContain("audio_latency = 64")
    expect(config).toContain("input_menu_toggle_gamepad_combo = 4")
    expect(config.lastIndexOf('video_fullscreen = "false"')).toBeGreaterThan(
      config.indexOf('video_fullscreen = "true"'),
    )
    expect(config.lastIndexOf('menu_driver = "rgui"')).toBeGreaterThan(
      config.indexOf('menu_driver = "ozone"'),
    )
    expect(
      config.lastIndexOf('cache_directory = "/override/cache"'),
    ).toBeGreaterThan(config.indexOf('cache_directory = "/cache/retroarch"'))
  })

  it("renders expanded video audio and input tuning settings", () => {
    const config = renderRetroArchConfig({
      video: {
        fullscreenWidth: 0,
        fullscreenHeight: 720,
        refreshRate: 59.94,
        aspectRatio: "config",
        aspectRatioValue: 1.3333,
        forceAspect: true,
        scale: 3,
        integerScale: true,
        cropOverscan: false,
        smooth: false,
        shader: "/shaders/crt.glslp",
        shaderEnable: true,
        hdr: {
          enable: true,
          maxNits: 1000,
          paperWhiteNits: 200,
          contrast: 1.25,
          expandGamut: false,
        },
        recording: { postFilter: true, gpu: true },
        gpuScreenshot: true,
        shaderWatchFiles: true,
        sync: {
          hardSync: true,
          hardSyncFrames: 1,
          frameDelay: 99,
          frameDelayAuto: true,
        },
      },
      audio: {
        enable: true,
        menuEnable: false,
        mute: false,
        mixerMute: true,
        outputRate: 48000,
        device: "hw:0,0",
        dspPlugin: null,
        sync: true,
        latencyMs: 64,
        rateControl: true,
        rateControlDelta: 0.005,
        maxTimingSkew: 0.05,
        volumeDb: -3,
        mixerVolumeDb: -6,
        resamplerQuality: 4,
      },
      input: {
        autodetect: true,
        pollTypeBehavior: 2,
        axisThreshold: 0.5,
        analogDeadzone: 0.15,
        analogSensitivity: 1,
        remapBinds: true,
        descriptors: { labelShow: true, hideUnbound: false },
        overlay: {
          enable: true,
          path: "/overlays/handheld.cfg",
          opacity: 0.9,
          scale: 1.1,
          behindMenu: false,
          hideInMenu: true,
        },
        autoGameFocus: 0,
        menuToggleGamepadCombo: "start-select",
        quitGamepadCombo: "l3-r3",
        ports: {
          "1": { libretroDevice: 1, joypadIndex: 0, analogDpadMode: 1 },
          "2": { libretroDevice: 257, joypadIndex: 1 },
        },
      },
      extraSettings: { video_frame_delay: 3 },
    })

    expect(config).toContain("aspect_ratio_index = 20")
    expect(config).toContain("video_aspect_ratio = 1.3333")
    expect(config).toContain("video_fullscreen_x = 0")
    expect(config).toContain("video_fullscreen_y = 720")
    expect(config).toContain("video_scale = 3")
    expect(config).toContain("video_frame_delay = 99")
    expect(config).toContain('video_frame_delay_auto = "true"')
    expect(config).toContain('video_hdr_enable = "true"')
    expect(config).toContain('video_gpu_screenshot = "true"')
    expect(config).toContain("audio_out_rate = 48000")
    expect(config).toContain('audio_device = "hw:0,0"')
    expect(config).toContain("audio_volume = -3")
    expect(config).toContain("audio_resampler_quality = 4")
    expect(config).toContain("input_poll_type_behavior = 2")
    expect(config).toContain('input_overlay = "/overlays/handheld.cfg"')
    expect(config).toContain("input_auto_game_focus = 0")
    expect(config).toContain("input_quit_gamepad_combo = 2")
    expect(config).toContain("input_libretro_device_p1 = 1")
    expect(config).toContain("input_player1_joypad_index = 0")
    expect(config).toContain("input_player1_analog_dpad_mode = 1")
    expect(config).toContain("input_libretro_device_p2 = 257")
    expect(config.lastIndexOf("video_frame_delay = 3")).toBeGreaterThan(
      config.indexOf("video_frame_delay = 99"),
    )
  })

  it("renders verified named aspect ratio values", () => {
    expect(renderRetroArchConfig({ video: { aspectRatio: "full" } })).toContain(
      "aspect_ratio_index = 24",
    )
    expect(
      renderRetroArchConfig({ video: { aspectRatio: "core-provided" } }),
    ).toContain("aspect_ratio_index = 22")
    expect(
      renderRetroArchConfig({ video: { aspectRatio: "custom" } }),
    ).toContain("aspect_ratio_index = 23")
    expect(
      renderRetroArchConfig({ video: { aspectRatio: "square" } }),
    ).toContain("aspect_ratio_index = 21")
  })

  it("renders typed settings in stable group order before extraSettings", () => {
    const config = renderRetroArchConfig({
      lifecycle: {
        saveOnExit: true,
        showHiddenFiles: true,
        loadDummyOnCoreShutdown: false,
        historyListEnable: true,
        performanceCounters: true,
        allUsersControlMenu: false,
        suspendScreensaver: true,
        sustainedPerformanceMode: false,
        gameMode: true,
      },
      logging: {
        verbosity: true,
        libretroLogLevel: "info",
        fpsShow: true,
        memoryShow: true,
        framecountShow: true,
      },
      drivers: {
        input: "udev",
        joypad: "udev",
        video: "glcore",
        audio: "alsathread",
        resampler: "sinc",
        menu: "ozone",
        camera: "null",
        location: "null",
        record: "ffmpeg",
      },
      paths: {
        systemDirectory: "/bios",
        savefileDirectory: "/saves",
        savestateDirectory: "/states",
        screenshotDirectory: "/screenshots",
        contentDirectory: null,
        cacheDirectory: "/cache/retroarch",
        assetsDirectory: "/share/retroarch/assets",
        thumbnailsDirectory: "/data/retroarch/thumbnails",
        playlistDirectory: "/data/retroarch/playlists",
        libretroDirectory: "/lib/retroarch/cores",
        libretroInfoPath: "/share/libretro/info",
        coreAssetsDirectory: "/data/retroarch/downloads",
        coreOptionsPath: "/config/retroarch/core-options.cfg",
        joypadAutoconfigDirectory: "/share/retroarch/autoconfig",
        inputRemappingDirectory: "/config/retroarch/remaps",
        overlayDirectory: "/config/retroarch/overlays",
        videoShaderDirectory: "/share/retroarch/shaders",
        cheatDatabasePath: "/data/retroarch/cheats",
        contentDatabasePath: "/data/retroarch/database/rdb",
        contentRuntimeLog: true,
        recordingOutputDirectory: "/captures/retroarch",
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
      extraSettings: { video_fullscreen: false },
    })

    expect(config).toBe(
      [
        'config_save_on_exit = "true"',
        'auto_overrides_enable = "false"',
        'auto_remaps_enable = "false"',
        'game_specific_options = "false"',
        'auto_shaders_enable = "false"',
        'show_hidden_files = "true"',
        'load_dummy_on_core_shutdown = "false"',
        'history_list_enable = "true"',
        'perfcnt_enable = "true"',
        'all_users_control_menu = "false"',
        'suspend_screensaver_enable = "true"',
        'sustained_performance_mode = "false"',
        'gamemode_enable = "true"',
        'log_verbosity = "true"',
        'libretro_log_level = "info"',
        'fps_show = "true"',
        'memory_show = "true"',
        'framecount_show = "true"',
        'input_driver = "udev"',
        'input_joypad_driver = "udev"',
        'video_driver = "glcore"',
        'audio_driver = "alsathread"',
        'audio_resampler = "sinc"',
        'menu_driver = "ozone"',
        'camera_driver = "null"',
        'location_driver = "null"',
        'record_driver = "ffmpeg"',
        'system_directory = "/bios"',
        'savefile_directory = "/saves"',
        'savestate_directory = "/states"',
        'screenshot_directory = "/screenshots"',
        'cache_directory = "/cache/retroarch"',
        'assets_directory = "/share/retroarch/assets"',
        'thumbnails_directory = "/data/retroarch/thumbnails"',
        'playlist_directory = "/data/retroarch/playlists"',
        'libretro_directory = "/lib/retroarch/cores"',
        'libretro_info_path = "/share/libretro/info"',
        'core_assets_directory = "/data/retroarch/downloads"',
        'core_options_path = "/config/retroarch/core-options.cfg"',
        'joypad_autoconfig_dir = "/share/retroarch/autoconfig"',
        'input_remapping_directory = "/config/retroarch/remaps"',
        'overlay_directory = "/config/retroarch/overlays"',
        'video_shader_dir = "/share/retroarch/shaders"',
        'cheat_database_path = "/data/retroarch/cheats"',
        'content_database_path = "/data/retroarch/database/rdb"',
        'content_runtime_log = "true"',
        'recording_output_directory = "/captures/retroarch"',
        'video_fullscreen = "true"',
        'video_windowed_fullscreen = "true"',
        'video_vsync = "true"',
        "aspect_ratio_index = 22",
        'audio_enable = "true"',
        "audio_latency = 64",
        'input_autodetect_enable = "true"',
        "input_max_users = 4",
        "input_menu_toggle_gamepad_combo = 4",
        'video_fullscreen = "false"',
        "",
      ].join("\n"),
    )
  })

  it("renders logging appendconfig extraArgs and environment unsets", () => {
    const spec = composeRetroArchLaunchSpec({
      command: "/run/current-system/sw/bin/retroarch",
      policy: {
        environment: { WAYLAND_DISPLAY: null, SDL_VIDEODRIVER: "x11" },
        logging: { verbose: true, logFile: "retroarch.log" },
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
        "--log-file=/tmp/launch/logs/retroarch.log",
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

  it("rejects absolute log files and extraArgs log-file duplication", () => {
    const facts = {
      configPath: "/tmp/launch/retroarch.cfg",
      corePath: "/cores/mgba_libretro.so",
      contentPath: "/games/gba/SMA.gba",
    }

    expect(() =>
      composeRetroArchLaunchSpec({
        policy: { logging: { logFile: "/tmp/retroarch.log" } },
        facts,
      }),
    ).toThrow(/logging\.logFile.*relative/)
    expect(() =>
      composeRetroArchLaunchSpec({
        policy: { logging: { logFile: "../retroarch.log" } },
        facts,
      }),
    ).toThrow(/logging\.logFile.*logs/)
    expect(() =>
      composeRetroArchLaunchSpec({
        policy: { extraArgs: ["--log-file=/tmp/retroarch.log"] },
        facts,
      }),
    ).toThrow(/log file/)
    expect(() =>
      composeRetroArchLaunchSpec({
        policy: { extraArgs: ["--log-file", "/tmp/retroarch.log"] },
        facts,
      }),
    ).toThrow(/log file/)
  })

  it("rejects duplicate typed config key registration", () => {
    expect(() =>
      assertUniqueRetroArchTypedConfigKeys([
        ["video_fullscreen", "video.fullscreen"],
        ["video_fullscreen", "video.alias"],
      ]),
    ).toThrow(/Duplicate RetroArch typed cfg key/)
  })

  it("rejects config injection through append paths and raw settings", () => {
    expect(() =>
      renderRetroArchConfig({
        configFile: { append: ["/tmp/a.cfg|/tmp/b.cfg"] },
      }),
    ).toThrow(/append.*\|/)
    expect(() =>
      renderRetroArchConfig({
        extraSettings: { "video_fullscreen\nauto_overrides_enable": true },
      }),
    ).toThrow(/extraSettings key/)
    expect(() =>
      renderRetroArchConfig({
        extraSettings: { cheevos_password: "secret" },
      }),
    ).toThrow(/plaintext credential/)
  })

  it("rejects extraArgs that duplicate launch identity", () => {
    const facts = {
      configPath: "/tmp/launch/retroarch.cfg",
      corePath: "/cores/mgba_libretro.so",
      contentPath: "/games/gba/SMA.gba",
    }

    for (const extraArgs of [
      ["-L", "/other/core.so"],
      ["--libretro"],
      ["--libretro=/other/core.so"],
      ["-L/other/core.so"],
    ]) {
      expect(() =>
        composeRetroArchLaunchSpec({ policy: { extraArgs }, facts }),
      ).toThrow(/core selection/)
    }

    for (const extraArgs of [
      ["-c", "/tmp/other.cfg"],
      ["--config"],
      ["--config=/tmp/other.cfg"],
      ["-c/tmp/other.cfg"],
    ]) {
      expect(() =>
        composeRetroArchLaunchSpec({ policy: { extraArgs }, facts }),
      ).toThrow(/config file selection/)
    }

    for (const extraArgs of [
      ["--appendconfig"],
      ["--appendconfig=/tmp/a.cfg"],
    ]) {
      expect(() =>
        composeRetroArchLaunchSpec({ policy: { extraArgs }, facts }),
      ).toThrow(/append configs/)
    }
  })
})
