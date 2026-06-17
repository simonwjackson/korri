import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { parse } from "yaml"

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
  it("decodes the full Ryubing readable fixture", async () => {
    const fixture = parse(
      await readFile(
        "product/platform/library/config/fixtures/ryubing-full.korri.yaml",
        "utf8",
      ),
    ) as {
      readonly storage: Record<string, unknown>
      readonly providers: Record<string, unknown>
      readonly systems: Record<string, unknown>
      readonly apps: Record<string, unknown>
      readonly collections: Record<string, unknown>
      readonly library: Record<string, unknown>
    }

    expect(decodeStoragePayload(fixture.storage["switch-card"]).root).toContain(
      "/run/media/korri/storage/",
    )
    expect(fixture.providers["@korri:switch-card"]).toBeDefined()
    expect(decodeSystemPayload(fixture.systems.switch).name).toBe(
      "Nintendo Switch",
    )
    const app = decodeAppPayload(fixture.apps.ryubing)
    expect(app.kind).toBe("ryubing")
    expect(app.state?.require?.keys).toEqual(["prod.keys"])
    expect(app.state).not.toHaveProperty("firmware")
    expect(app.config).not.toHaveProperty("version")
    expect(
      (app.input as { controllers?: Array<{ mapping?: { a?: string } }> })
        ?.controllers?.[0]?.mapping?.a,
    ).toBe("button-east")
    expect(
      decodeLibraryItemPayload(fixture.library["mario-kart-8-deluxe"])
        .releases[0]?.target,
    ).toContain("roms/switch/Mario Kart 8 Deluxe")
  })

  it("decodes the full Steam readable fixture", async () => {
    const fixture = parse(
      await readFile(
        "product/platform/library/config/fixtures/steam-full.korri.yaml",
        "utf8",
      ),
    ) as {
      readonly storage: Record<string, unknown>
      readonly providers: Record<string, unknown>
      readonly systems: Record<string, unknown>
      readonly apps: Record<string, unknown>
      readonly runtimes: Record<string, unknown>
      readonly library: Record<string, unknown>
    }

    expect(decodeStoragePayload(fixture.storage.steam).root).toBe(
      "/var/lib/korri/steam",
    )
    expect(fixture.providers["@korri:steam"]).toBeDefined()
    expect(decodeSystemPayload(fixture.systems.steam).apps).toEqual([
      { id: "steam" },
    ])
    const steam = decodeAppPayload(fixture.apps.steam)
    expect(steam.kind).toBe("steam")
    expect(steam.state?.root).toBe("{storage:steam}/Steam")
    expect(steam["launch-options"]).toContain("%command%")
    expect(decodeRuntimePayload(fixture.runtimes["proton-arm64"]).tool).toBe(
      "proton-arm64",
    )
    expect(
      decodeLibraryItemPayload(fixture.library.balatro).releases.map(
        release => release.apps?.map(choice => choice.id) ?? [],
      ),
    ).toEqual([[], ["steam"], []])
    expect(
      decodeLibraryItemPayload(fixture.library["gba-choice-demo"]).releases[0]
        ?.apps,
    ).toEqual([{ id: "retroarch", runtime: "mgba" }, { id: "mgba-standalone" }])
  })

  it("decodes a plain host block without role/launch/profile nesting", () => {
    const host = decodeHostPayload({
      title: "AKA desktop host",
      launch: {
        with: {
          "@korri:gamescope": { enable: true, backend: { type: "wayland" } },
        },
      },
    })

    expect(host.title).toBe("AKA desktop host")
    expect(host.launch?.with?.["@korri:gamescope"]?.enable).toBe(true)
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
      menu: { showStartScreen: false, pauseLibretro: true },
      saves: { autosaveIntervalSeconds: 60, autoLoadState: true },
      rewind: { enable: true, bufferSizeMb: 20 },
      playback: { pauseNonactive: true, fastforwardRatio: 0 },
      latency: {
        runAhead: { enable: true, frames: 2 },
        preemptiveFrames: { enable: true, frames: 3 },
      },
      achievements: {
        enable: true,
        username: "player-one",
        hardcoreMode: true,
        badges: true,
        richPresence: false,
        testUnofficial: true,
      },
      haptics: { vibrateOnKeypress: true, deviceVibration: false },
      playlists: { useOldFormat: false },
      privacy: { cameraDevice: null, cameraAllow: false, locationAllow: false },
      updater: {
        showOnlineUpdater: false,
        showCoreUpdater: false,
        buildbotUrl: null,
        buildbotAssetsUrl: "https://updates.example.invalid/assets",
        autoExtractArchive: false,
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
        achievements: { username: "player-two" },
        updater: { showOnlineUpdater: false },
      }).achievements?.username,
    ).toBe("player-two")
  })

  it("decodes Ryubing policy on readable cascade records and flat app records", () => {
    const ryubing = {
      state: { root: "/state/Ryujinx" },
      graphics: { backend: "vulkan" },
      extra: { args: ["--future"], config: { future_key: true } },
    }

    const cases: Array<readonly [string, () => { ryubing?: unknown }]> = [
      ["global", () => decodeGlobalConfigPayload({ ryubing })],
      ["host", () => decodeHostPayload({ ryubing })],
      ["user", () => decodeUserPayload({ ryubing })],
      ["system", () => decodeSystemPayload({ ryubing })],
      [
        "launcher",
        () =>
          decodeLauncherPayload({
            command: "Ryujinx",
            args: [],
            systems: ["switch"],
            ryubing,
          }),
      ],
      ["preset", () => decodePresetPayload({ ryubing })],
      [
        "app",
        () => ({ ryubing: decodeAppPayload({ kind: "ryubing", ...ryubing }) }),
      ],
      [
        "runtime",
        () =>
          decodeRuntimePayload({ kind: "tool", path: "/bin/Ryujinx", ryubing }),
      ],
      [
        "source",
        () =>
          decodeSourcePayload({ kind: ["files"], storage: "roms", ryubing }),
      ],
      ["profile", () => decodeProfilePayload({ ryubing })],
      [
        "library-item",
        () =>
          decodeLibraryItemPayload({
            ryubing,
            releases: [{ id: "switch", system: "switch", target: "game.nsp" }],
          }),
      ],
      [
        "library-release",
        () =>
          decodeLibraryItemPayload({
            releases: [
              { id: "switch", system: "switch", target: "game.nsp", ryubing },
            ],
          }).releases[0] ?? {},
      ],
      [
        "contained-playable",
        () =>
          decodeLibraryItemPayload({
            contains: { child: { ryubing } },
            releases: [{ id: "switch", system: "switch", target: "game.nsp" }],
          }).contains?.child ?? {},
      ],
      [
        "game",
        () =>
          decodeGamePayload({
            system: "switch",
            contentPath: "/games/game.nsp",
            ryubing,
          }),
      ],
    ]

    for (const [, decode] of cases) {
      expect(decode().ryubing).toMatchObject(ryubing)
    }
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
    expect(() =>
      decodeAppPayload({ kind: "retroarch", achievements: { password: "x" } }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ kind: "retroarch", netplay: { enable: true } }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ kind: "retroarch", remoteCommand: { enable: true } }),
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
      collections: ["steam", "handheld"],
      releases: [
        {
          id: "windows",
          system: "windows",
          target: "steam://rungameid/360740",
          apps: [{ id: "steam" }],
        },
      ],
    })

    expect(item.releases.map(release => release.id)).toEqual(["windows"])
    expect(item.releases[0]?.target).toBe("steam://rungameid/360740")
    expect(item.releases[0]?.apps).toEqual([{ id: "steam" }])
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: "steam://rungameid/360740",
            app: "steam",
          },
        ],
      }),
    ).toThrow(/apps\[\]|release\.app/i)
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: "steam://rungameid/360740",
            runtime: "proton",
          },
        ],
      }),
    ).toThrow(/apps\[\]|release\.runtime/i)
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        system: "windows",
        target: "steam://rungameid/360740",
        apps: [{ id: "steam", runtime: "proton" }],
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
          system: "genesis",
          target: { kind: "file", storage: "roms", path: "genesis/Sonic.md" },
        },
        { id: "windows-known", system: "windows" },
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
