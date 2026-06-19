import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { parse } from "yaml"

import { decodeAppPayload, decodeAppRecord } from "./app"
import { decodeCollectionPayload } from "./collection"
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

const wrapperProvider = "@example:wrapper"
const retiredWrapperKey = ["game", "scope"].join("")
type WrapperPolicy = { readonly enable?: boolean }
const wrapperPolicy = (value: unknown): WrapperPolicy | undefined =>
  value as WrapperPolicy | undefined

describe("readable library schema records", () => {
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
      readonly launchers: Record<string, unknown>
      readonly runtimes: Record<string, unknown>
      readonly library: Record<string, unknown>
    }

    expect(
      decodeStoragePayload(fixture.storage["@korri:steam/steam"]).root,
    ).toBe("/var/lib/korri/steam")
    expect(fixture.providers["@korri:steam"]).toBeDefined()
    expect(decodeSystemPayload(fixture.systems.steam).name).toBe("Steam")
    const steam = decodeAppPayload(fixture.launchers["@korri:steam/steam"])
    expect(steam.plugin).toBe("@korri:steam")
    expect(steam.settings?.plugin).toMatchObject({
      state: { root: "{storage:@korri:steam/steam}/Steam" },
    })
    expect(
      (steam.settings?.plugin as { readonly "launch-options"?: string })?.[
        "launch-options"
      ],
    ).toContain("%command%")
    expect(decodeRuntimePayload(fixture.runtimes["proton-arm64"]).tool).toBe(
      "proton-arm64",
    )
    expect(
      decodeLibraryItemPayload(fixture.library.balatro).releases.map(
        release => release.launch?.use ?? null,
      ),
    ).toEqual(["@korri:steam/steam", "@korri:steam/steam", null])
    expect(
      decodeLibraryItemPayload(fixture.library["gba-choice-demo"]).releases[0]
        ?.launch,
    ).toEqual({ use: "@korri:retroarch/retroarch", runtime: "mgba" })
  })

  it("decodes a plain host block without role/launch/profile nesting", () => {
    const host = decodeHostPayload({
      title: "AKA desktop host",
      launch: {
        with: {
          [wrapperProvider]: { enable: true, backend: { type: "wayland" } },
        },
      },
    })

    expect(host.title).toBe("AKA desktop host")
    expect(wrapperPolicy(host.launch?.with?.[wrapperProvider])?.enable).toBe(
      true,
    )
    expect(
      decodeHostPayload({
        moonlight: { platform: { name: "v4l2m2m" } },
      }).moonlight?.platform?.name,
    ).toBe("v4l2m2m")
    for (const wrapper of [
      { enabled: true },
      { backend: "wayland" },
      { exposeWayland: true },
      { args: ["--nearest"] },
      { forceXwayland: true },
    ]) {
      expect(() =>
        decodeHostPayload({ [retiredWrapperKey]: wrapper }),
      ).toThrow()
    }
    expect(() => decodeHostPayload({ role: "desktop" })).toThrow()
    expect(() => decodeHostPayload({ launch: { app: "steam" } })).toThrow()
    expect(() => decodeHostPayload({ profiles: { handheld: {} } })).toThrow()
  })

  it("rejects the retired top-level wrapper key on readable cascade records", () => {
    const retired = { [retiredWrapperKey]: { enable: true } }
    const cases: Array<readonly [string, () => unknown]> = [
      ["global", () => decodeGlobalConfigPayload(retired)],
      ["host", () => decodeHostPayload(retired)],
      ["user", () => decodeUserPayload(retired)],
      ["system", () => decodeSystemPayload(retired)],
      [
        "launcher",
        () =>
          decodeLauncherPayload({
            command: "retroarch",
            args: [],
            systems: [],
            ...retired,
          }),
      ],
      ["preset", () => decodePresetPayload(retired)],
      ["app", () => decodeAppPayload({ command: "retroarch", ...retired })],
      [
        "runtime",
        () =>
          decodeRuntimePayload({ kind: "tool", path: "/bin/tool", ...retired }),
      ],
      ["source", () => decodeSourcePayload({ kind: ["service"], ...retired })],
      ["profile", () => decodeProfilePayload(retired)],
      ["collection", () => decodeCollectionPayload(retired)],
      [
        "library-item",
        () =>
          decodeLibraryItemPayload({
            ...retired,
            releases: [
              {
                id: "default",
                system: "stream",
                target: { kind: "url", value: "peer" },
                launch: { use: "@korri:moonlight/moonlight" },
              },
            ],
          }),
      ],
      [
        "library-release",
        () =>
          decodeLibraryItemPayload({
            releases: [
              { id: "default", system: "stream", target: { kind: "url", value: "peer" }, ...retired },
            ],
          }),
      ],
      [
        "contained-playable",
        () =>
          decodeLibraryItemPayload({
            contains: { child: retired },
            releases: [
              {
                id: "default",
                system: "stream",
                target: { kind: "url", value: "peer" },
                launch: { use: "@korri:moonlight/moonlight" },
              },
            ],
          }),
      ],
      [
        "game",
        () =>
          decodeGamePayload({
            system: "stream",
            contentPath: "peer",
            ...retired,
          }),
      ],
    ]

    for (const [, decode] of cases) {
      expect(decode).toThrow()
    }
  })

  it("decodes moonlight policy on readable cascade records", () => {
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
            releases: [
              {
                id: "default",
                system: "stream",
                target: { kind: "url", value: "peer" },
                launch: { use: "@korri:moonlight/moonlight" },
              },
            ],
          }),
      ],
      [
        "library-release",
        () =>
          decodeLibraryItemPayload({
            releases: [
              {
                id: "default",
                system: "stream",
                target: { kind: "url", value: "peer" },
                launch: { use: "@korri:moonlight/moonlight" },
                moonlight,
              },
            ],
          }).releases[0] ?? {},
      ],
      [
        "contained-playable",
        () =>
          decodeLibraryItemPayload({
            contains: { child: { moonlight } },
            releases: [
              {
                id: "default",
                system: "stream",
                target: { kind: "url", value: "peer" },
                launch: { use: "@korri:moonlight/moonlight" },
              },
            ],
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

  it("decodes RetroArch policy only inside plugin-owned policy maps", () => {
    const retroarch = {
      configFile: { mode: "generated" },
      drivers: { menu: "ozone" },
      extraSettings: { video_font_enable: false },
      extraArgs: ["--features"],
    }
    const plugin = { "@korri:retroarch": retroarch }

    expect(decodeGlobalConfigPayload({ plugin }).plugin).toMatchObject(plugin)
    expect(
      decodeAppRecord({
        id: "@korri:retroarch/retroarch",
        plugin: "@korri:retroarch",
        command: "retroarch",
        settings: { plugin: retroarch },
      }).settings?.plugin,
    ).toMatchObject(retroarch)
  })

  it("rejects retired RetroArch typed-app vocabulary", () => {
    expect(() =>
      decodeAppPayload({ plugin: "@korri:retroarch", retroarch: {} }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ plugin: "@korri:retroarch", integration: "retroarch" }),
    ).toThrow()
    expect(() =>
      decodeHostPayload({ retroarch: { configFile: { mode: "path" } } }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ plugin: "@korri:retroarch", achievements: { password: "x" } }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ plugin: "@korri:retroarch", netplay: { enable: true } }),
    ).toThrow()
    expect(() =>
      decodeAppPayload({ plugin: "@korri:retroarch", remoteCommand: { enable: true } }),
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
          target: { kind: "url", value: "steam://rungameid/360740" },
          launch: { use: "@korri:steam/steam" },
        },
      ],
    })

    expect(item.releases.map(release => release.id)).toEqual(["windows"])
    expect(item.releases[0]?.target).toEqual({ kind: "url", value: "steam://rungameid/360740" })
    expect(item.releases[0]?.launch).toEqual({ use: "@korri:steam/steam" })
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://rungameid/360740" },
            app: "@korri:steam/steam",
          },
        ],
      }),
    ).toThrow(/release\.app|app/i)
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        releases: [
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://rungameid/360740" },
            runtime: "proton",
          },
        ],
      }),
    ).toThrow(/release\.runtime|runtime/i)
    expect(() =>
      decodeLibraryItemPayload({
        title: "Downwell",
        system: "windows",
        target: { kind: "url", value: "steam://rungameid/360740" },
        launch: { use: "@korri:steam/steam", runtime: "proton" },
        releases: [
          {
            id: "windows",
            system: "windows",
            target: { kind: "url", value: "steam://rungameid/360740" },
          },
        ],
      }),
    ).toThrow()
  })

  it("allows known-only and target-only releases as non-launchable metadata", () => {
    const item = decodeLibraryItemPayload({
      title: "Sonic the Hedgehog",
      releases: [
        {
          id: "genesis",
          system: "genesis",
          target: { kind: "file", storage: "roms", path: "genesis/Sonic.md" },
          launch: { use: "@korri:retroarch/retroarch" },
        },
        { id: "windows-known", system: "windows" },
      ],
    })

    expect(item.releases[1]?.target).toBeUndefined()
    const targetOnly = decodeLibraryItemPayload({
      title: "Known only",
      releases: [
        {
          id: "windows-known",
          system: "windows",
          target: { kind: "url", value: "steam://rungameid/360740" },
        },
      ],
    })
    expect(targetOnly.releases[0]?.launch).toBeUndefined()
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
