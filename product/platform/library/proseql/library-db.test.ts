import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import {
  LOCAL_HOST_KEY,
  makeKorriLibraryDbConfig,
  openKorriLibraryDb,
} from "./library-db"
import { createLibraryRepository } from "./library-repository"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-library-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("makeKorriLibraryDbConfig", () => {
  it("declares only the readable canonical persisted sections", () => {
    const config = makeKorriLibraryDbConfig("/tmp/x")
    const names = Object.keys(config.collections).sort()
    expect(names).toEqual([
      "apps",
      "collections",
      "host",
      "library",
      "profiles",
      "runtimes",
      "sources",
      "storage",
      "systems",
      "users",
    ])
    expect(names).not.toContain("config")
    expect(names).not.toContain("games")
    expect(names).not.toContain("launchers")
    expect(names).not.toContain("modules")
  })

  it("declares a single strict documents source rooted at the library directory", () => {
    const config = makeKorriLibraryDbConfig("/tmp/x")
    expect(config.sources.length).toBe(1)
    const src = config.sources[0]
    expect(src?.kind).toBe("documents")
    expect(src?.root).toBe("/tmp/x")
    expect(src?.collections).toBe("all")
    expect(src?.outbox).toBe("library.yaml")
  })

  it("uses derivedFromKey for canonical map collections and the host storage shim", () => {
    const config = makeKorriLibraryDbConfig("/tmp/x")
    for (const [name, col] of Object.entries(config.collections)) {
      expect(col.id, name).toEqual({ kind: "derivedFromKey", field: "id" })
    }
  })
})

describe("openKorriLibraryDb — empty root", () => {
  it("opens an empty root as empty canonical collections", async () => {
    await withTempRoot(async root => {
      const counts = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              host: (yield* Effect.promise(() => db.host.query().runPromise))
                .length,
              storage: (yield* Effect.promise(
                () => db.storage.query().runPromise,
              )).length,
              sources: (yield* Effect.promise(
                () => db.sources.query().runPromise,
              )).length,
              systems: (yield* Effect.promise(
                () => db.systems.query().runPromise,
              )).length,
              apps: (yield* Effect.promise(() => db.apps.query().runPromise))
                .length,
              runtimes: (yield* Effect.promise(
                () => db.runtimes.query().runPromise,
              )).length,
              profiles: (yield* Effect.promise(
                () => db.profiles.query().runPromise,
              )).length,
              collections: (yield* Effect.promise(
                () => db.collections.query().runPromise,
              )).length,
              users: (yield* Effect.promise(() => db.users.query().runPromise))
                .length,
              library: (yield* Effect.promise(
                () => db.library.query().runPromise,
              )).length,
            }
          }),
        ),
      )
      expect(counts).toEqual({
        host: 0,
        storage: 0,
        sources: 0,
        systems: 0,
        apps: 0,
        runtimes: 0,
        profiles: 0,
        collections: 0,
        users: 0,
        library: 0,
      })
    })
  })
})

describe("openKorriLibraryDb — readable YAML contract", () => {
  it("loads a plain host block plus map-keyed canonical sections", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "library.yaml"),
        [
          "host:",
          "  title: AKA desktop host",
          "  gamescope:",
          "    enable: true",
          "storage:",
          "  roms:",
          "    root: /games",
          "sources:",
          "  roms:",
          "    title: Local ROM library",
          "    kind: [files]",
          "    storage: roms",
          "systems:",
          "  genesis:",
          "    name: Sega Genesis",
          "apps:",
          "  retroarch:",
          "    command: retroarch",
          '    args: ["-L", "{runtime.path}", "{content.path}"]',
          "    systems: [genesis]",
          "runtimes:",
          "  genesis-plus-gx:",
          "    kind: libretro-core",
          "    path: /etc/korri/cores/genesis_plus_gx_libretro.so",
          "profiles:",
          "  handheld:",
          "    title: Handheld 640x480",
          "collections:",
          "  handheld:",
          "    title: Handheld friendly",
          "users:",
          "  simon:",
          "    displayName: Simon",
          "library:",
          "  sonic-the-hedgehog:",
          "    title: Sonic the Hedgehog",
          "    source: roms",
          "    collections: [handheld]",
          "    releases:",
          "      - id: genesis",
          "        system: genesis",
          "        target: genesis/Sonic The Hedgehog.md",
          "        apps:",
          "          - id: retroarch",
          "            runtime: genesis-plus-gx",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              host: yield* db.host.findById(LOCAL_HOST_KEY),
              source: yield* db.sources.findById("roms"),
              runtime: yield* db.runtimes.findById("genesis-plus-gx"),
              item: yield* db.library.findById("sonic-the-hedgehog"),
            }
          }),
        ),
      )

      expect(loaded.host.title).toBe("AKA desktop host")
      expect(loaded.source.kind).toEqual(["files"])
      expect(loaded.runtime.path).toBe(
        "/etc/korri/cores/genesis_plus_gx_libretro.so",
      )
      expect(loaded.item.releases.map(release => release.id)).toEqual([
        "genesis",
      ])
    })
  })

  it("decodes the checked-in readable example fixture", async () => {
    await withTempRoot(async root => {
      const example = await readFile(
        "korri-catalog-display-metadata.example.yaml",
        "utf8",
      )
      await writeFile(join(root, "library.yaml"), example, "utf8")

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              host: yield* db.host.findById(LOCAL_HOST_KEY),
              downwell: yield* db.library.findById("downwell"),
              sonic: yield* db.library.findById("sonic-the-hedgehog"),
              gbaPackage: yield* db.library.findById("super-mario-advance-2"),
            }
          }),
        ),
      )

      expect(loaded.host.title).toBe("AKA desktop host")
      expect(loaded.downwell.releases[0]?.target).toBe(
        "steam://rungameid/360740",
      )
      expect(loaded.sonic.releases.map(release => release.id)).toEqual([
        "genesis",
        "windows-known",
        "steam",
      ])
      expect(loaded.gbaPackage.contains?.["super-mario-world"]?.relation).toBe(
        "gba-port",
      )
    })
  })

  it("discovers platform-default fragments without clobbering library.yaml records", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "00-korri-platform-defaults.yaml"),
        [
          "host:",
          "  moonlight:",
          "    command: /nix/store/moonlight-embedded-korri/bin/moonlight",
          "    input:",
          "      mappingFile: /nix/store/moonlight/share/moonlight/gamecontrollerdb.txt",
          "    platform:",
          "      name: v4l2m2m",
          "  gamescope:",
          "    app:",
          "      environment:",
          "        WAYLAND_DISPLAY: null",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(root, "library.yaml"),
        [
          "storage:",
          "  roms:",
          "    root: /roms",
          "sources:",
          "  roms:",
          "    kind: [files]",
          "    storage: roms",
          "systems:",
          "  snes:",
          "    name: Super Nintendo",
          "runtimes:",
          "  snes9x:",
          "    kind: libretro-core",
          "    path: /cores/snes9x_libretro.so",
          "apps:",
          "  retroarch:",
          "    command: retroarch",
          '    args: ["-L", "{runtime.path}", "{content.path}"]',
          "    gamescope:",
          "      backend:",
          "        type: drm",
          "library:",
          "  zelda:",
          "    title: Zelda",
          "    source: roms",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target: snes/zelda.sfc",
          "        apps:",
          "          - id: retroarch",
          "            runtime: snes9x",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            const repository = createLibraryRepository(db)
            return {
              app: yield* db.apps.findById("retroarch"),
              launch: yield* repository.resolveLaunchForPlayable("zelda"),
              localMoonlight:
                yield* repository.resolveLocalLauncherPolicy("moonlight"),
              libraryYaml: yield* Effect.promise(() =>
                readFile(join(root, "library.yaml"), "utf8"),
              ),
            }
          }),
        ),
      )

      expect(loaded.app.gamescope?.backend?.type).toBe("drm")
      expect(loaded.app.gamescope?.app?.environment).toBeUndefined()
      expect(loaded.launch.spec.command).toBe("retroarch")
      expect(loaded.launch.spec.args).toContain("/cores/snes9x_libretro.so")
      expect(loaded.launch.spec.args).toContain("/roms/snes/zelda.sfc")
      expect(loaded.libraryYaml).toContain("library:\n  zelda:")
      expect(loaded.libraryYaml).not.toContain("00-korri-platform-defaults")
      expect(loaded.launch.gamescope?.backend?.type).toBe("drm")
      expect(loaded.launch.gamescope?.app?.environment).toEqual({
        WAYLAND_DISPLAY: null,
      })
      expect(loaded.localMoonlight.moonlight).toMatchObject({
        command: "/nix/store/moonlight-embedded-korri/bin/moonlight",
        input: {
          mappingFile:
            "/nix/store/moonlight/share/moonlight/gamecontrollerdb.txt",
        },
        platform: { name: "v4l2m2m" },
      })
    })
  })

  it("persists host as a plain block and peer sections as maps", async () => {
    await withTempRoot(async root => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            yield* db.host.create({ id: LOCAL_HOST_KEY, title: "AKA" })
            yield* db.storage.create({ id: "roms", root: "/games" })
            yield* db.sources.create({
              id: "roms",
              kind: ["files"],
              storage: "roms",
            })
            yield* db.library.create({
              id: "sonic-the-hedgehog",
              title: "Sonic the Hedgehog",
              releases: [
                {
                  id: "genesis",
                  system: "genesis",
                  target: "genesis/Sonic.md",
                },
              ],
            })
            yield* Effect.promise(() => db.flush())
          }),
        ),
      )

      const outbox = await readFile(join(root, "library.yaml"), "utf8")
      expect(outbox).toContain("host:\n  title: AKA")
      expect(outbox).not.toContain(`${LOCAL_HOST_KEY}:\n    title: AKA`)
      expect(outbox).toContain("storage:\n  roms:")
      expect(outbox).toContain("sources:\n  roms:")
      expect(outbox).toContain("library:\n  sonic-the-hedgehog:")
      expect(outbox).not.toContain("games:")
      expect(outbox).not.toContain("launchers:")
      expect(outbox).not.toContain("modules:")
      expect(outbox).not.toContain("config:")
    })
  })
})

describe("openKorriLibraryDb — platform-default collision guard", () => {
  it("rejects platform-default app records that duplicate user library app records", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "00-korri-platform-defaults.yaml"),
        [
          "apps:",
          "  retroarch:",
          "    gamescope:",
          "      app:",
          "        environment:",
          "          WAYLAND_DISPLAY: null",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(root, "library.yaml"),
        [
          "apps:",
          "  retroarch:",
          "    command: retroarch",
          '    args: ["-L", "{runtime.path}", "{content.path}"]',
          "",
        ].join("\n"),
        "utf8",
      )
      const exit = await Effect.runPromiseExit(
        Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})

describe("openKorriLibraryDb — strict-mode rejections", () => {
  it("rejects old persisted top-level collection keys", async () => {
    for (const key of ["games", "launchers", "modules", "config"] as const) {
      await withTempRoot(async root => {
        await mkdir(root, { recursive: true })
        await writeFile(
          join(root, "library.yaml"),
          [`${key}:`, "  old:", "    title: legacy", ""].join("\n"),
          "utf8",
        )
        const exit = await Effect.runPromiseExit(
          Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
        )
        expect(exit._tag, key).toBe("Failure")
      })
    }
  })

  it("rejects invalid persisted library item keys", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "library.yaml"),
        [
          "library:",
          "  super-mario-advance-2/super-mario-world:",
          "    releases:",
          "      - id: gba",
          "        system: gba",
          "        target: gba/cart.gba",
          "",
        ].join("\n"),
        "utf8",
      )
      const exit = await Effect.runPromiseExit(
        Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
      )
      expect(exit._tag).toBe("Failure")
    })
  })

  it("rejects invalid programmatic library item keys before persistence", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return yield* db.library.create({
              id: "super-mario-advance-2/super-mario-world",
              releases: [{ id: "gba", system: "gba", target: "gba/cart.gba" }],
            })
          }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    })
  })

  it("rejects unknown keys inside persisted readable records", async () => {
    await withTempRoot(async root => {
      await writeFile(
        join(root, "library.yaml"),
        ["host:", "  title: AKA", "  role: desktop", ""].join("\n"),
        "utf8",
      )
      const exit = await Effect.runPromiseExit(
        Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
      )
      expect(exit._tag).toBe("Failure")
    })
  })

  it("surfaces removed legacy collections as explicit failures", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return yield* db.games.create({
              id: "legacy",
              system: "snes",
              contentPath: "/storage/legacy.sfc",
            })
          }),
        ),
      )

      expect(exit._tag).toBe("Failure")
      expect(String(exit)).toContain("legacy library collection 'games'")
    })
  })

  it("surfaces removed legacy collections inside transactions", async () => {
    await withTempRoot(async root => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return yield* db.$transaction(tx =>
              tx.games.create({
                id: "legacy",
                system: "snes",
                contentPath: "/storage/legacy.sfc",
              }),
            )
          }),
        ),
      )

      expect(exit._tag).toBe("Failure")
      expect(String(exit)).toContain("legacy library collection 'games'")
    })
  })

  it("rejects a YAML file with an unknown top-level collection key", async () => {
    await withTempRoot(async root => {
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, "library.yaml"),
        ["launchTargets:", "  legacy-key:", "    gameId: x", ""].join("\n"),
        "utf8",
      )
      const exit = await Effect.runPromiseExit(
        Effect.scoped(openKorriLibraryDb({ root, writeDebounce: 1 })),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})
