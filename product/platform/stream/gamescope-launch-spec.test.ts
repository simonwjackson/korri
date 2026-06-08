import { describe, expect, it } from "bun:test"
import { normalizeGamescopePolicy } from "@platform/library/config/inheritable-fields"
import type { LaunchSpec } from "@platform/library/launcher"

import { composeGamescopeLaunchSpec } from "./gamescope-launch-spec"

const game: LaunchSpec = {
  command: "retroarch",
  args: ["-L", "mgba", "mario.gba"],
  env: { KEEP: "1", DROP: "old", OVERRIDE: "old" },
  cwd: "/games",
}

const innerArgs = (spec: LaunchSpec): readonly string[] => {
  const sep = spec.args.indexOf("--")
  expect(sep).toBeGreaterThanOrEqual(0)
  return spec.args.slice(sep + 1)
}

const gamescopeArgs = (spec: LaunchSpec): readonly string[] => {
  const sep = spec.args.indexOf("--")
  expect(sep).toBeGreaterThanOrEqual(0)
  return spec.args.slice(0, sep)
}

describe("composeGamescopeLaunchSpec", () => {
  it("returns the game unchanged when Gamescope is disabled", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: false,
      display: { nested: { width: 640 } },
      extraArgs: ["--ignored"],
    })

    expect(spec).toBe(game)
  })

  it("renders the normalized default policy as kiosk Gamescope flags", () => {
    const spec = composeGamescopeLaunchSpec(
      game,
      normalizeGamescopePolicy(undefined),
    )

    expect(spec.command).toBe("gamescope")
    expect(spec.cwd).toBe("/games")
    expect(spec.env).toEqual(game.env)
    expect(spec.args).toEqual([
      "--backend",
      "wayland",
      "-f",
      "-b",
      "--expose-wayland",
      "--",
      "retroarch",
      "-L",
      "mgba",
      "mario.gba",
    ])
  })

  it("renders app-side WAYLAND_DISPLAY unsets after the separator", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: true,
      app: { environment: { WAYLAND_DISPLAY: null } },
    })

    expect(innerArgs(spec)).toEqual([
      "env",
      "-u",
      "WAYLAND_DISPLAY",
      "retroarch",
      "-L",
      "mgba",
      "mario.gba",
    ])
    expect(spec.env).toEqual(game.env)
  })

  it("renders app env set and unset operations without changing Gamescope env", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: true,
      app: {
        environment: {
          WAYLAND_DISPLAY: null,
          SDL_VIDEODRIVER: "x11",
        },
      },
    })

    expect(innerArgs(spec)).toEqual([
      "env",
      "-u",
      "WAYLAND_DISPLAY",
      "SDL_VIDEODRIVER=x11",
      "retroarch",
      "-L",
      "mgba",
      "mario.gba",
    ])
    expect(spec.env).toEqual(game.env)
  })

  it("applies Gamescope environment overlays when the game has no base env", () => {
    const spec = composeGamescopeLaunchSpec(
      { command: "retroarch", args: ["mario.gba"] },
      { enable: true, environment: { ADDED: "1", DROP_FROM_PARENT: null } },
    )

    expect(spec.env).toEqual({ ADDED: "1", DROP_FROM_PARENT: null })
    expect(innerArgs(spec)).toEqual(["retroarch", "mario.gba"])
  })

  it("keeps spec.env undefined when neither game nor Gamescope policy set env", () => {
    const spec = composeGamescopeLaunchSpec(
      { command: "retroarch", args: ["mario.gba"] },
      { enable: true },
    )

    expect(spec.env).toBeUndefined()
  })

  it("applies Gamescope process environment overlays without app wrappers", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: true,
      environment: {
        DROP: null,
        OVERRIDE: "new",
        ADDED: "1",
      },
    })

    expect(spec.env).toEqual({
      KEEP: "1",
      DROP: null,
      OVERRIDE: "new",
      ADDED: "1",
    })
    expect(innerArgs(spec)).toEqual(["retroarch", "-L", "mgba", "mario.gba"])
  })

  it("renders structured flag groups in deterministic order", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: true,
      command: "/run/current-system/sw/bin/gamescope",
      backend: {
        type: "sdl",
        allowDeferred: true,
        preferVkDevice: "1002:7300",
      },
      window: {
        fullscreen: true,
        borderless: true,
        grabKeyboard: true,
        forceGrabCursor: true,
        displayIndex: 1,
        forceWindowsFullscreen: true,
        exposeWayland: true,
        xwaylandCount: 2,
        fadeOutDuration: 150,
      },
      display: {
        output: {
          width: 1920,
          height: 1080,
          preferredConnectors: ["DP-1", "HDMI-A-1"],
        },
        nested: {
          width: 1280,
          height: 720,
          refresh: 60,
          unfocusedRefresh: 30,
        },
        scale: { max: 2 },
        orientation: "normal",
        adaptiveSync: true,
        framerateLimit: 60,
      },
      scaling: { scaler: "fit", filter: "pixel", sharpness: 10 },
      cursor: {
        image: "/usr/share/icons/cursor.png",
        hotspot: "10,20",
        hideDelay: 500,
        scaleHeight: 1080,
      },
      input: { mouseSensitivity: 1.5, defaultTouchMode: 4 },
      scheduling: { realtime: true, readyFd: 3, keepAlive: true },
      stats: { path: "/tmp/gamescope.stats" },
      steam: { enableIntegration: true, mangoapp: true },
      embedded: {
        generateDrmMode: "cvt",
        immediateFlips: true,
        virtualConnectorStrategy: "SingleApplication",
      },
      hdr: {
        enable: true,
        sdrGamutWideness: 0.75,
        sdrContentNits: 400,
        inverseToneMapping: {
          enable: true,
          sdrNits: 100,
          targetNits: 1000,
        },
        debug: { forceSupport: true, forceOutput: true, heatmap: true },
      },
      vr: {
        overlayKey: "korri.overlay",
        appOverlayKey: "korri.app",
        explicitName: "Korri",
        defaultName: "Korri Game",
        icon: "/usr/share/icons/korri.png",
        showImmediately: true,
        modal: true,
        physicalWidth: 1.2,
        physicalCurvature: 0.5,
        physicalPreCurvePitch: 5,
        scrollSpeed: 8,
        sessionManager: true,
        controlBar: { enable: true, keyboard: true, close: true },
        clickStabilization: true,
      },
      reshade: { effect: "crt.fx", techniqueIndex: 0 },
      steamDeck: { muraMap: "/usr/share/gamescope/mura.bin" },
      debug: {
        disableLayers: true,
        layers: true,
        focus: true,
        synchronousX11: true,
        hud: true,
        events: true,
        forceComposition: true,
        compositeMarkers: true,
        disableColorManagement: true,
        disableXres: true,
      },
    })

    expect(spec.command).toBe("/run/current-system/sw/bin/gamescope")
    expect(gamescopeArgs(spec)).toEqual([
      "--backend",
      "sdl",
      "--allow-deferred-backend",
      "--prefer-vk-device",
      "1002:7300",
      "-f",
      "-b",
      "-g",
      "--force-grab-cursor",
      "--display-index",
      "1",
      "--force-windows-fullscreen",
      "--expose-wayland",
      "--xwayland-count",
      "2",
      "--fade-out-duration",
      "150",
      "-W",
      "1920",
      "-H",
      "1080",
      "-O",
      "DP-1",
      "-O",
      "HDMI-A-1",
      "-w",
      "1280",
      "-h",
      "720",
      "-r",
      "60",
      "-o",
      "30",
      "-m",
      "2",
      "--force-orientation",
      "normal",
      "--adaptive-sync",
      "--framerate-limit",
      "60",
      "-S",
      "fit",
      "-F",
      "pixel",
      "--sharpness",
      "10",
      "--cursor",
      "/usr/share/icons/cursor.png",
      "--cursor-hotspot",
      "10,20",
      "-C",
      "500",
      "--cursor-scale-height",
      "1080",
      "-s",
      "1.5",
      "--default-touch-mode",
      "4",
      "--rt",
      "-R",
      "3",
      "--keep-alive",
      "-T",
      "/tmp/gamescope.stats",
      "-e",
      "--mangoapp",
      "--generate-drm-mode",
      "cvt",
      "--immediate-flips",
      "--virtual-connector-strategy",
      "SingleApplication",
      "--hdr-enabled",
      "--sdr-gamut-wideness",
      "0.75",
      "--hdr-sdr-content-nits",
      "400",
      "--hdr-itm-enabled",
      "--hdr-itm-sdr-nits",
      "100",
      "--hdr-itm-target-nits",
      "1000",
      "--hdr-debug-force-support",
      "--hdr-debug-force-output",
      "--hdr-debug-heatmap",
      "--vr-overlay-key",
      "korri.overlay",
      "--vr-app-overlay-key",
      "korri.app",
      "--vr-overlay-explicit-name",
      "Korri",
      "--vr-overlay-default-name",
      "Korri Game",
      "--vr-overlay-icon",
      "/usr/share/icons/korri.png",
      "--vr-overlay-show-immediately",
      "--vr-overlay-modal",
      "--vr-overlay-physical-width",
      "1.2",
      "--vr-overlay-physical-curvature",
      "0.5",
      "--vr-overlay-physical-pre-curve-pitch",
      "5",
      "--vr-scroll-speed",
      "8",
      "--vr-session-manager",
      "--vr-overlay-enable-control-bar",
      "--vr-overlay-enable-control-bar-keyboard",
      "--vr-overlay-enable-control-bar-close",
      "--vr-overlay-enable-click-stabilization",
      "--reshade-effect",
      "crt.fx",
      "--reshade-technique-idx",
      "0",
      "--mura-map",
      "/usr/share/gamescope/mura.bin",
      "--disable-layers",
      "--debug-layers",
      "--debug-focus",
      "--synchronous-x11",
      "--debug-hud",
      "--debug-events",
      "--force-composition",
      "--composite-debug",
      "--disable-color-management",
      "--disable-xres",
    ])
  })

  it("appends extraArgs after typed flags and before the app separator", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: true,
      scaling: { filter: "nearest" },
      extraArgs: ["--custom", "value"],
    })

    expect(spec.args).toEqual([
      "--backend",
      "wayland",
      "-f",
      "-b",
      "--expose-wayland",
      "-F",
      "nearest",
      "--custom",
      "value",
      "--",
      "retroarch",
      "-L",
      "mgba",
      "mario.gba",
    ])
  })

  it("renders paired dimensions once cascade folding supplies both sides", () => {
    const spec = composeGamescopeLaunchSpec(game, {
      enable: true,
      display: { nested: { width: 640, height: 480 } },
    })

    expect(gamescopeArgs(spec)).toEqual(
      expect.arrayContaining(["-w", "640", "-h", "480"]),
    )
  })

  it("rejects incomplete output and nested dimensions before rendering argv", () => {
    expect(() =>
      composeGamescopeLaunchSpec(game, {
        enable: true,
        display: { output: { width: 1920 } },
      }),
    ).toThrow("display.output width and height must be provided together")

    expect(() =>
      composeGamescopeLaunchSpec(game, {
        enable: true,
        display: { nested: { height: 480 } },
      }),
    ).toThrow("display.nested width and height must be provided together")
  })
})
