import { describe, expect, it } from "bun:test"

import { decodeAppPayload, decodeAppRecord } from "./app"
import { decodeGamePayload } from "./game"
import { decodeGlobalConfigPayload } from "./global"
import { decodeHostPayload } from "./host"
import { decodeLauncherPayload } from "./launcher"
import { decodeLibraryItemPayload } from "./library-item"
import { decodePresetPayload } from "./preset"
import { decodeProfilePayload } from "./profile"
import { decodeRuntimePayload } from "./runtime"
import { decodeSourcePayload } from "./source"
import { decodeStoragePayload } from "./storage"
import { decodeSystemPayload } from "./system"
import { decodeUserPayload } from "./user"

describe("readable library schema records", () => {
  it("decodes a plain host block without role/launch/profile nesting", () => {
    const host = decodeHostPayload({
      title: "AKA desktop host",
      gamescope: { enable: true, backend: { type: "wayland" } },
    })

    expect(host.title).toBe("AKA desktop host")
    expect(host.gamescope?.enable).toBe(true)
    expect(
      decodeHostPayload({
        moonlight: { platform: { name: "v4l2m2m" } },
      }).moonlight?.platform?.name,
    ).toBe("v4l2m2m")
    for (const gamescope of [
      { enabled: true },
      { backend: "wayland" },
      { exposeWayland: true },
      { args: ["--nearest"] },
      { forceXwayland: true },
    ]) {
      expect(() => decodeHostPayload({ gamescope })).toThrow()
    }
    expect(() => decodeHostPayload({ role: "desktop" })).toThrow()
    expect(() => decodeHostPayload({ launch: { app: "steam" } })).toThrow()
    expect(() => decodeHostPayload({ profiles: { handheld: {} } })).toThrow()
  })

  it("decodes moonlight policy on every readable cascade record", () => {
    const moonlight = {
      environment: { OLD_VALUE: null },
      platform: { name: "v4l2m2m" },
      input: { devices: ["/dev/input/event10"] },
      extraArgs: ["-diagnostic"],
    }

    const cases: Array<readonly [string, () => { moonlight?: unknown }]> = [
      ["global", () => decodeGlobalConfigPayload({ moonlight })],
      ["host", () => decodeHostPayload({ moonlight })],
      ["user", () => decodeUserPayload({ moonlight })],
      ["system", () => decodeSystemPayload({ moonlight })],
      [
        "launcher",
        () =>
          decodeLauncherPayload({
            command: "moonlight",
            args: [],
            systems: [],
            moonlight,
          }),
      ],
      ["preset", () => decodePresetPayload({ moonlight })],
      ["app", () => decodeAppPayload({ moonlight })],
      [
        "runtime",
        () =>
          decodeRuntimePayload({
            kind: "tool",
            path: "/run/current-system/sw/bin/moonlight",
            moonlight,
          }),
      ],
      ["source", () => decodeSourcePayload({ kind: ["service"], moonlight })],
      ["profile", () => decodeProfilePayload({ moonlight })],
      [
        "library-item",
        () =>
          decodeLibraryItemPayload({
            moonlight,
            releases: [{ id: "default", system: "stream", target: "peer" }],
          }),
      ],
      [
        "library-release",
        () =>
          decodeLibraryItemPayload({
            releases: [
              { id: "default", system: "stream", target: "peer", moonlight },
            ],
          }).releases[0] ?? {},
      ],
      [
        "contained-playable",
        () =>
          decodeLibraryItemPayload({
            contains: { child: { moonlight } },
            releases: [{ id: "default", system: "stream", target: "peer" }],
          }).contains?.child ?? {},
      ],
      [
        "game",
        () =>
          decodeGamePayload({
            system: "stream",
            contentPath: "peer",
            moonlight,
          }),
      ],
    ]

    for (const [, decode] of cases) {
      expect(decode().moonlight).toMatchObject(moonlight)
    }
  })

  it("decodes RetroArch policy on readable cascade records and flat app records", () => {
    const retroarch = {
      environment: { WAYLAND_DISPLAY: null },
      configFile: { mode: "generated" },
      lifecycle: { saveOnExit: false, showHiddenFiles: true },
      logging: { verbosity: true, fpsShow: true },
      drivers: { menu: "ozone", resampler: "sinc" },
      paths: { contentDirectory: null, cacheDirectory: "/outside/cache" },
      video: {
        fullscreen: true,
        fullscreenWidth: 0,
        aspectRatio: "full",
        sync: { frameDelay: 99, frameDelayAuto: true },
      },
      audio: { outputRate: 48000, mute: false, rateControlDelta: 0.005 },
      input: {
        pollTypeBehavior: 2,
        overlay: { enable: true, opacity: 0.9 },
        quitGamepadCombo: "start-select",
        ports: { "1": { libretroDevice: 1, joypadIndex: 0 } },
      },
      extraSettings: { video_font_enable: false },
      extraArgs: ["--features"],
    }

    expect(
      decodeAppPayload({
        kind: "retroarch",
        command: "retroarch",
        ...retroarch,
      }).drivers?.menu,
    ).toBe("ozone")

    const cases: Array<readonly [string, () => { retroarch?: unknown }]> = [
      ["global", () => decodeGlobalConfigPayload({ retroarch })],
      ["host", () => decodeHostPayload({ retroarch })],
      ["user", () => decodeUserPayload({ retroarch })],
      ["system", () => decodeSystemPayload({ retroarch })],
      [
        "launcher",
        () =>
          decodeLauncherPayload({
            command: "retroarch",
            args: [],
            systems: [],
            retroarch,
          }),
      ],
      ["preset", () => decodePresetPayload({ retroarch })],
      [
        "runtime",
        () =>
          decodeRuntimePayload({
            kind: "libretro-core",
            path: "/cores/mgba_libretro.so",
            retroarch,
          }),
      ],
      [
        "source",
        () =>
          decodeSourcePayload({ kind: ["files"], storage: "roms", retroarch }),
      ],
      ["profile", () => decodeProfilePayload({ retroarch })],
      [
        "library-item",
        () =>
          decodeLibraryItemPayload({
            retroarch,
            releases: [{ id: "default", system: "gba", target: "game.gba" }],
          }),
      ],
      [
        "library-release",
        () =>
          decodeLibraryItemPayload({
            releases: [
              { id: "default", system: "gba", target: "game.gba", retroarch },
            ],
          }).releases[0] ?? {},
      ],
      [
        "contained-playable",
        () =>
          decodeLibraryItemPayload({
            contains: { child: { retroarch } },
            releases: [{ id: "default", system: "gba", target: "game.gba" }],
          }).contains?.child ?? {},
      ],
      [
        "game",
        () =>
          decodeGamePayload({
            system: "gba",
            contentPath: "game.gba",
            retroarch,
          }),
      ],
    ]

    for (const [, decode] of cases) {
      expect(decode().retroarch).toMatchObject(retroarch)
    }

    expect(
      decodeAppRecord({
        id: "retroarch",
        command: "retroarch",
        drivers: { video: "glcore" },
      }).drivers?.video,
    ).toBe("glcore")
  })

  it("rejects retired RetroArch typed-app vocabulary", () => {
    expect(() =>
      decodeAppPayload({ kind: "retroarch", retroarch: {} }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ kind: "retroarch", integration: "retroarch" }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({
        kind: "retroarch",
        settings: { video_fullscreen: true },
      }),
    ).toThrow()
    expect(() =>
      decodeHostPayload({ retroarch: { configFile: { mode: "path" } } }),
    ).toThrow()
    expect(() =>
      decodeHostPayload({
        retroarch: { configFile: { mode: "generated", path: "/tmp/cfg" } },
      }),
    ).toThrow()
  })

  it("rejects retired Moonlight launch-policy vocabulary in readable records", () => {
    const retiredMoonlightPolicies = [
      { KORRI_MOONLIGHT_COMMAND: "/bin/moonlight" },
      { KORRI_MOONLIGHT_PLATFORM: "v4l2m2m" },
      { action: "stream" },
      { app: { name: "Korri Stream", host: "aka.local" } },
      { config: { load: "/tmp/moonlight.conf", save: true } },
      { stream: { resolution: { preset: "720" } } },
      { platform: { source: "nixos" } },
      { input: { requireInputPlumber: true } },
      { control: { commands: { setBitrate: true } } },
      { control: { runtimeDir: "/run/korri/moonlight" } },
      { runtimeSettings: { oneShot: { enable: true } } },
      { runtimeSettings: { adaptationSpike: { enable: true } } },
    ]

    for (const moonlight of retiredMoonlightPolicies) {
      expect(() => decodeHostPayload({ moonlight })).toThrow()
    }
  })

  it("decodes local storage roots and rejects provider leakage", () => {
    const storage = decodeStoragePayload({
      root: "/games",
      path: { roms: "roms", saves: "saves" },
    })

    expect(storage.root).toBe("/games")
    expect(storage.path?.roms).toBe("roms")
    expect(() =>
      decodeStoragePayload({ root: "/games", provider: "filesystem" }),
    ).toThrow()
  })

  it("requires source kind arrays with the fixed readable vocabulary", () => {
    expect(
      decodeSourcePayload({
        title: "Steam",
        kind: ["service", "metadata"],
        storage: "steam",
      }).kind,
    ).toEqual(["service", "metadata"])

    expect(() =>
      decodeSourcePayload({ title: "Steam", kind: "service" }),
    ).toThrow()
    expect(() => decodeSourcePayload({ kind: ["manual"] })).toThrow()
    expect(() => decodeSourcePayload({ kind: ["store"] })).toThrow()
    expect(() => decodeSourcePayload({ kind: ["observation"] })).toThrow()
    expect(() => decodeSourcePayload({ kind: ["files"] })).toThrow()
  })

  it("requires files sources to name storage", () => {
    expect(
      decodeSourcePayload({ kind: ["files"], storage: "roms" }).storage,
    ).toBe("roms")
    expect(decodeSourcePayload({ kind: ["service"] }).storage).toBeUndefined()
  })

  it("decodes runtimes without the old module vocabulary", () => {
    const runtime = decodeRuntimePayload({
      kind: "libretro-core",
      path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
    })

    expect(runtime.path).toBe("/etc/korri/cores/genesis_plus_gx_libretro.so")
    expect(() =>
      decodeRuntimePayload({
        kind: "libretro-core",
        path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
        module: "genesis-plus-gx",
      }),
    ).toThrow()
  })

  it("requires ordered releases and rejects shortcut top-level launch fields", () => {
    const item = decodeLibraryItemPayload({
      title: "Downwell",
      source: "steam",
      collections: ["steam", "handheld"],
      releases: [
        {
          id: "windows",
          system: "windows",
          target: "steam://rungameid/360740",
          app: "steam",
        },
      ],
    })

    expect(item.releases.map(release => release.id)).toEqual(["windows"])
    expect(item.releases[0]?.target).toBe("steam://rungameid/360740")
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        system: "windows",
        target: "steam://rungameid/360740",
        app: "steam",
        runtime: "proton",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: "steam://rungameid/360740",
          },
        ],
      }),
    ).toThrow()
  })

  it("allows known-only releases but requires at least one launchable target", () => {
    const item = decodeLibraryItemPayload({
      title: "Sonic the Hedgehog",
      releases: [
        {
          id: "genesis",
          source: "roms",
          system: "genesis",
          target: "genesis/Sonic.md",
        },
        { id: "windows-known", source: "pcgamingwiki", system: "windows" },
      ],
    })

    expect(item.releases[1]?.target).toBeUndefined()
    expect(() =>
      decodeLibraryItemPayload({
        title: "Known only",
        releases: [{ id: "windows-known", system: "windows" }],
      }),
    ).toThrow()
  })

  it("rejects absolute release targets", () => {
    expect(() =>
      decodeLibraryItemPayload({
        title: "ROM",
        releases: [
          { id: "snes", system: "snes", target: "/storage/roms/game.sfc" },
        ],
      }),
    ).toThrow()
  })
})
