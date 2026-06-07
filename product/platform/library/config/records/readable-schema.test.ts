import { describe, expect, it } from "bun:test"

import { decodeHostPayload } from "./host"
import { decodeLibraryItemPayload } from "./library-item"
import { decodeRuntimePayload } from "./runtime"
import { decodeSourcePayload } from "./source"
import { decodeStoragePayload } from "./storage"

describe("readable library schema records", () => {
  it("decodes a plain host block without role/launch/profile nesting", () => {
    const host = decodeHostPayload({
      title: "AKA desktop host",
      gamescope: { enabled: true, backend: "wayland" },
    })

    expect(host.title).toBe("AKA desktop host")
    expect(host.gamescope?.enabled).toBe(true)
    expect(() => decodeHostPayload({ role: "desktop" })).toThrow()
    expect(() => decodeHostPayload({ launch: { app: "steam" } })).toThrow()
    expect(() => decodeHostPayload({ profiles: { handheld: {} } })).toThrow()
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
