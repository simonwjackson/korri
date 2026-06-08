import { describe, expect, it } from "bun:test"

import {
  decodeByLauncherPayload,
  decodeGamescopePolicy,
  decodeInheritableLayer,
  decodeMoonlightPolicy,
  type GamescopePolicy,
  type MoonlightPolicy,
  normalizeGamescopePolicy,
} from "./inheritable-fields"

const representativeGamescopePolicy: GamescopePolicy = {
  enable: true,
  command: "/run/current-system/sw/bin/gamescope",
  environment: {
    GAMESCOPE_DISABLE_EXPLICIT_SYNC: "1",
    OBSOLETE_VAR: null,
  },
  app: {
    environment: {
      WAYLAND_DISPLAY: null,
      SDL_VIDEODRIVER: "x11",
    },
  },
  backend: {
    type: "openvr",
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
    orientation: "left",
    adaptiveSync: true,
    framerateLimit: 60,
  },
  scaling: {
    scaler: "fit",
    filter: "pixel",
    sharpness: 12,
  },
  cursor: {
    image: "/tmp/cursor.png",
    hotspot: "10,20",
    hideDelay: 500,
    scaleHeight: 1080,
  },
  input: {
    mouseSensitivity: 1.25,
    defaultTouchMode: 4,
  },
  scheduling: {
    realtime: true,
    readyFd: 3,
    keepAlive: true,
  },
  stats: {
    path: "/tmp/gamescope.stats",
  },
  steam: {
    enableIntegration: true,
    mangoapp: true,
  },
  embedded: {
    generateDrmMode: "cvt",
    immediateFlips: true,
    virtualConnectorStrategy: "PerWindow",
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
    debug: {
      forceSupport: true,
      forceOutput: true,
      heatmap: true,
    },
  },
  vr: {
    overlayKey: "korri.overlay",
    appOverlayKey: "korri.app",
    explicitName: "Korri",
    defaultName: "Korri Game",
    icon: "/tmp/icon.png",
    showImmediately: true,
    modal: true,
    physicalWidth: 1.2,
    physicalCurvature: 0.5,
    physicalPreCurvePitch: 5,
    scrollSpeed: 8,
    sessionManager: true,
    controlBar: {
      enable: true,
      keyboard: true,
      close: true,
    },
    clickStabilization: true,
  },
  reshade: {
    effect: "crt.fx",
    techniqueIndex: 1,
  },
  steamDeck: {
    muraMap: "/tmp/mura.bin",
  },
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
  extraArgs: ["--unmodelled-flag"],
}

describe("GamescopePolicy", () => {
  it("decodes an empty object as 'no opinion'", () => {
    const policy = decodeGamescopePolicy({})
    expect(policy).toEqual({})
  })

  it("decodes a representative nested policy", () => {
    const policy = decodeGamescopePolicy(representativeGamescopePolicy)
    expect(policy).toEqual(representativeGamescopePolicy)
  })

  it("decodes nullable environment overlays for Gamescope and the app", () => {
    const policy = decodeGamescopePolicy({
      environment: { FOO: null, BAR: "baz" },
      app: { environment: { WAYLAND_DISPLAY: null } },
    })

    expect(policy.environment?.FOO).toBeNull()
    expect(policy.environment?.BAR).toBe("baz")
    expect(policy.app?.environment?.WAYLAND_DISPLAY).toBeNull()
  })

  it("allows nested dimensions to decode independently before cascade folding", () => {
    expect(
      decodeGamescopePolicy({ display: { nested: { width: 1280 } } }),
    ).toEqual({ display: { nested: { width: 1280 } } })
    expect(
      decodeGamescopePolicy({ display: { nested: { height: 720 } } }),
    ).toEqual({ display: { nested: { height: 720 } } })
  })

  it("rejects retired flat fields", () => {
    for (const oldFieldPolicy of [
      { enabled: true },
      { backend: "wayland" },
      { exposeWayland: true },
      { args: ["-F", "fsr"] },
      { forceXwayland: true },
    ]) {
      expect(() => decodeGamescopePolicy(oldFieldPolicy)).toThrow()
    }
  })

  it("rejects an unknown key", () => {
    expect(() =>
      decodeGamescopePolicy({ enable: true, gamescpoe: "typo" }),
    ).toThrow()
  })

  it("rejects executable/package and runtime-control fields outside launch policy", () => {
    for (const badPolicy of [
      { package: "gamescope" },
      { control: { enable: true } },
    ]) {
      expect(() => decodeGamescopePolicy(badPolicy)).toThrow()
    }
  })

  it("rejects unknown enum values", () => {
    for (const badPolicy of [
      { backend: { type: "vulkan-direct" } },
      { scaling: { scaler: "cover" } },
      { scaling: { filter: "bicubic" } },
      { display: { orientation: "portrait" } },
      { embedded: { virtualConnectorStrategy: "PerProcess" } },
      { embedded: { generateDrmMode: "gtf" } },
      { input: { defaultTouchMode: 5 } },
    ]) {
      expect(() => decodeGamescopePolicy(badPolicy)).toThrow()
    }
  })

  it("rejects out-of-range sharpness and HDR values", () => {
    for (const badPolicy of [
      { scaling: { sharpness: -1 } },
      { scaling: { sharpness: 21 } },
      { hdr: { sdrGamutWideness: -0.1 } },
      { hdr: { sdrGamutWideness: 1.1 } },
      { hdr: { inverseToneMapping: { sdrNits: 1001 } } },
      { hdr: { inverseToneMapping: { targetNits: 10001 } } },
    ]) {
      expect(() => decodeGamescopePolicy(badPolicy)).toThrow()
    }
  })

  it("normalizes a missing policy to the nested kiosk-shaped default", () => {
    expect(normalizeGamescopePolicy(undefined)).toEqual({
      enable: true,
      backend: { type: "wayland" },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: true,
      },
    })
  })

  it("merges partial window overrides with default window fields", () => {
    expect(
      normalizeGamescopePolicy({ window: { exposeWayland: false } }).window,
    ).toEqual({
      fullscreen: true,
      borderless: true,
      exposeWayland: false,
    })
  })

  it("preserves explicit policy fields over the default", () => {
    expect(
      normalizeGamescopePolicy({
        enable: false,
        backend: { type: "drm" },
        window: {
          fullscreen: false,
          borderless: false,
          exposeWayland: false,
        },
        extraArgs: ["-F", "fsr"],
      }),
    ).toEqual({
      enable: false,
      backend: { type: "drm" },
      window: {
        fullscreen: false,
        borderless: false,
        exposeWayland: false,
      },
      extraArgs: ["-F", "fsr"],
    })
  })
})

const representativeMoonlightPolicy: MoonlightPolicy = {
  command: "/run/current-system/sw/bin/moonlight",
  environment: {
    SDL_VIDEODRIVER: "wayland",
    OLD_MOONLIGHT_STATE_HOME: null,
  },
  logging: { verbose: false, debug: false },
  stream: {
    resolution: { width: 1280, height: 720 },
    fps: 60,
    bitrateKbps: 12000,
    packetSizeBytes: null,
    codec: "auto",
    remoteOptimizations: false,
    unsupportedHost: false,
    quitAppAfter: false,
    noSops: false,
    localAudio: false,
    surround: false,
    keyDir: null,
  },
  platform: { name: "v4l2m2m" },
  input: {
    devices: ["/dev/input/event10"],
    mappingFile: "/run/current-system/sw/share/gamecontrollerdb.txt",
    viewOnly: false,
    rotate: 0,
    touch: {
      absolute: true,
      requireBounds: true,
      bounds: { x: 0, y: 0, w: 1080, h: 1920 },
    },
  },
  audio: { device: null },
  window: { windowed: false, autoResize: true },
  control: {
    enable: true,
    authority: "controller",
    allowRootPeers: false,
  },
  extraArgs: ["-unsupported-test-flag"],
}

describe("MoonlightPolicy", () => {
  it("decodes an empty object as 'no opinion'", () => {
    expect(decodeMoonlightPolicy({})).toEqual({})
  })

  it("decodes a representative stream launch policy", () => {
    expect(decodeMoonlightPolicy(representativeMoonlightPolicy)).toEqual(
      representativeMoonlightPolicy,
    )
  })

  it("preserves nullable environment overlays as executable unsets", () => {
    const policy = decodeMoonlightPolicy({
      environment: { SDL_VIDEODRIVER: "wayland", OLD_VALUE: null },
    })

    expect(policy.environment?.SDL_VIDEODRIVER).toBe("wayland")
    expect(policy.environment?.OLD_VALUE).toBeNull()
  })

  it("accepts open non-empty platform names", () => {
    expect(
      decodeMoonlightPolicy({ platform: { name: "future-patched-backend" } }),
    ).toEqual({ platform: { name: "future-patched-backend" } })
    expect(() => decodeMoonlightPolicy({ platform: { name: "" } })).toThrow()
  })

  it("rejects retired or product-invariant fields", () => {
    for (const badPolicy of [
      { KORRI_MOONLIGHT_PLATFORM: "v4l2m2m" },
      { client: "embedded" },
      { action: "stream" },
      { app: { name: "Korri Stream" } },
      { config: { load: "/tmp/moonlight.conf" } },
      { stream: { resolution: { preset: "720" } } },
      { platform: { source: "nixos" } },
      { input: { requireInputPlumber: true } },
      { control: { commands: { setBitrate: true } } },
      { control: { runtimeDir: "/run/korri/moonlight" } },
      { control: { sessionId: "session-1" } },
      { control: { socketPath: "/run/korri/moonlight/control.sock" } },
      { runtimeSettings: { oneShot: { enable: true } } },
      { runtimeSettings: { adaptationSpike: { enable: true } } },
    ]) {
      expect(() => decodeMoonlightPolicy(badPolicy)).toThrow()
    }
  })

  it("rejects malformed touch bounds", () => {
    for (const badPolicy of [
      { input: { touch: { bounds: { x: 0, y: 0, w: 0, h: 100 } } } },
      { input: { touch: { bounds: { x: 0, y: 0, w: 100 } } } },
    ]) {
      expect(() => decodeMoonlightPolicy(badPolicy)).toThrow()
    }
  })
})

describe("InheritableLayer", () => {
  it("decodes an empty layer (zero opinions)", () => {
    const layer = decodeInheritableLayer({})
    expect(layer).toEqual({})
  })

  it("decodes a layer carrying every supported inheritable field", () => {
    const layer = decodeInheritableLayer({
      gamescope: {
        enable: true,
        command: "/run/current-system/sw/bin/gamescope",
        scaling: { filter: "fsr" },
        extraArgs: ["--unmodelled-flag"],
      },
      moonlight: {
        command: "/run/current-system/sw/bin/moonlight",
        platform: { name: "v4l2m2m" },
        input: { devices: ["/dev/input/event10"] },
      },
      env: { LANG: "en_US.UTF-8", SDL_VIDEODRIVER: "x11" },
      cwd: "/storage/roms",
      argsAppend: ["--fullscreen", "--verbose"],
      patches: ["/storage/patches/base.ips", "/storage/patches/qol.bps"],
    })
    expect(layer.gamescope?.enable).toBe(true)
    expect(layer.gamescope?.command).toBe(
      "/run/current-system/sw/bin/gamescope",
    )
    expect(layer.gamescope?.scaling?.filter).toBe("fsr")
    expect(layer.gamescope?.extraArgs).toEqual(["--unmodelled-flag"])
    expect(layer.moonlight?.platform?.name).toBe("v4l2m2m")
    expect(layer.moonlight?.input?.devices).toEqual(["/dev/input/event10"])
    expect(layer.env?.LANG).toBe("en_US.UTF-8")
    expect(layer.cwd).toBe("/storage/roms")
    expect(layer.argsAppend).toEqual(["--fullscreen", "--verbose"])
    expect(layer.patches).toEqual([
      "/storage/patches/base.ips",
      "/storage/patches/qol.bps",
    ])
  })

  it("rejects an unknown inheritable field (typo)", () => {
    expect(() =>
      decodeInheritableLayer({ gamescpoe: { enable: true } }),
    ).toThrow()
  })

  it("rejects a gamescope sub-object with an unknown key", () => {
    expect(() =>
      decodeInheritableLayer({
        gamescope: { enable: true, weirdKey: "bad" },
      }),
    ).toThrow()
  })
})

describe("byLauncher payload", () => {
  it("decodes an empty map", () => {
    const payload = decodeByLauncherPayload({})
    expect(payload).toEqual({})
  })

  it("decodes per-launcher inheritable contributions", () => {
    const payload = decodeByLauncherPayload({
      retroarch: {
        argsAppend: ["-L", "snes9x_libretro.so"],
        patches: ["/storage/patches/restoration.ips"],
      },
      dolphin: { env: { DOLPHIN_PROFILE: "default" } },
    })
    expect(payload.retroarch?.argsAppend).toEqual(["-L", "snes9x_libretro.so"])
    expect(payload.retroarch?.patches).toEqual([
      "/storage/patches/restoration.ips",
    ])
    expect(payload.dolphin?.env?.DOLPHIN_PROFILE).toBe("default")
  })

  it("rejects an unknown inheritable field inside a launcher entry", () => {
    expect(() =>
      decodeByLauncherPayload({
        retroarch: { argsAppend: ["-L", "x"], wat: true },
      }),
    ).toThrow()
  })
})
