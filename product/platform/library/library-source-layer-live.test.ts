import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Cause, Effect, Exit } from "effect"
import { withTempLibrary } from "../../../tools/testing/library/with-temp-library"
import {
  cascadeErrorMessage,
  PatchFileMissing,
  PatchFileNotRegular,
  PatchFileUnreadable,
  PatchUnsupportedForApp,
  supportedPatchFormatForPath,
  UnsupportedPatchExtension,
} from "./config/errors"
import { LibrarySource } from "./library-services"
import { LibrarySourceLayerLive } from "./library-source-layer-live"

const originalEnv = {
  desktopProfile: process.env.KORRI_DESKTOP_PROFILE,
  librarySource: process.env.KORRI_LIBRARY_SOURCE,
  configRoots: process.env.KORRI_CONFIG_ROOTS,
  home: process.env.HOME,
  xdgDataHome: process.env.XDG_DATA_HOME,
  rocknixGamelistRoots: process.env.KORRI_ROCKNIX_GAMELIST_ROOTS,
  rocknixEsSystemsPath: process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH,
  rocknixMediaRoot: process.env.KORRI_ROCKNIX_MEDIA_ROOT,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  restoreEnv()
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("LibrarySourceLayerLive", () => {
  it("uses ROCKNIX gamelists when explicitly selected", async () => {
    const lib = await seedRocknixGamelists()
    selectRocknixSource(lib)

    await expectListedGameNames(["Layer Echo"])
  })

  it("lets explicit ROCKNIX media root avoid an XDG data requirement", async () => {
    const lib = await seedRocknixGamelists()
    delete process.env.HOME
    delete process.env.XDG_DATA_HOME
    selectRocknixSource(lib)
    process.env.KORRI_ROCKNIX_MEDIA_ROOT = join(lib.rootDir, "media")

    await expectListedGameNames(["Layer Echo"])
  })

  it("maps missing ROCKNIX media XDG root to a library config error", async () => {
    delete process.env.HOME
    delete process.env.XDG_DATA_HOME
    process.env.KORRI_LIBRARY_SOURCE = "rocknix"

    await expectSourceListFailureMessage("XDG_DATA_HOME or HOME is required")
  })

  it("defaults the device desktop profile to ProseQL", async () => {
    const root = await seedConfigGraph("Device Echo")
    const lib = await seedRocknixGamelists()
    process.env.KORRI_DESKTOP_PROFILE = "device"
    process.env.KORRI_CONFIG_ROOTS = root
    selectRocknixFallback(lib)

    await expectListedGameNames(["Device Echo"])
  })

  it("does not treat an unsupported desktop profile as a live gamelist selector", async () => {
    const root = await seedConfigGraph("Generic Echo")
    const lib = await seedRocknixGamelists()
    process.env.KORRI_DESKTOP_PROFILE = "legacy-device"
    process.env.KORRI_CONFIG_ROOTS = root
    selectRocknixFallback(lib)

    await expectListedGameNames(["Generic Echo"])
  })

  it("reads ordered config roots and lets later roots win", async () => {
    const baseRoot = await seedConfigGraph("Base Echo")
    const overlayRoot = await mkdtemp(
      join(tmpdir(), "korri-config-overlay-"),
    )
    cleanups.push(() => rm(overlayRoot, { recursive: true, force: true }))
    await writeConfigFragment(overlayRoot, "Overlay Echo")
    delete process.env.KORRI_DESKTOP_PROFILE
    process.env.KORRI_LIBRARY_SOURCE = "proseql"
    process.env.KORRI_CONFIG_ROOTS = `${baseRoot}:${overlayRoot}`

    await expectListedGameNames(["Overlay Echo"])
  })

  it("defaults the config graph to the XDG config root", async () => {
    const home = await mkdtemp(join(tmpdir(), "korri-library-source-home-"))
    cleanups.push(() => rm(home, { recursive: true, force: true }))
    delete process.env.KORRI_CONFIG_ROOTS
    delete process.env.XDG_DATA_HOME
    process.env.HOME = home
    process.env.KORRI_LIBRARY_SOURCE = "proseql"

    await writeConfigFragment(
      join(home, ".local", "share", "korri", "config"),
      "XDG Echo",
    )

    await expectListedGameNames(["XDG Echo"])
  })

  it("treats an empty config graph as a valid empty catalog", async () => {
    delete process.env.KORRI_CONFIG_ROOTS
    delete process.env.XDG_DATA_HOME
    delete process.env.HOME
    process.env.KORRI_LIBRARY_SOURCE = "proseql"

    await expectListedGameNames([])
  })

  it("treats an explicitly empty KORRI_CONFIG_ROOTS as a valid empty catalog", async () => {
    process.env.KORRI_LIBRARY_SOURCE = "proseql"
    process.env.KORRI_CONFIG_ROOTS = ""

    await expectListedGameNames([])
  })
})

describe("cascadeErrorMessage", () => {
  it("maps patch validation failures to patch-specific library config messages", () => {
    expect(
      cascadeErrorMessage(
        new PatchFileMissing({ path: "/patches/missing.ips" }),
      ),
    ).toBe("patch file not found: /patches/missing.ips")

    expect(
      cascadeErrorMessage(
        new PatchFileUnreadable({
          path: "/patches/unreadable.bps",
          reason: "permission denied",
        }),
      ),
    ).toBe(
      "patch file is not readable: /patches/unreadable.bps (permission denied)",
    )

    expect(
      cascadeErrorMessage(
        new PatchFileNotRegular({
          path: "/patches/directory.ups",
          fileType: "directory",
        }),
      ),
    ).toBe(
      "patch file is not a regular file: /patches/directory.ups (directory)",
    )

    expect(
      cascadeErrorMessage(
        new UnsupportedPatchExtension({
          path: "/patches/hack.ppf",
          extension: ".ppf",
        }),
      ),
    ).toBe(
      "unsupported patch extension .ppf for /patches/hack.ppf; supported patch extensions are .ips, .bps, .ups, .xdelta",
    )

    expect(
      cascadeErrorMessage(
        new PatchUnsupportedForApp({
          appId: "dolphin",
          integration: "dolphin",
        }),
      ),
    ).toBe("patches are not supported for app dolphin (dolphin)")
  })

  it("keeps existing non-patch cascade messages stable", () => {
    expect(cascadeErrorMessage({ _tag: "LauncherUnresolvable" })).toBe(
      "missing launcher profile for game",
    )
    expect(cascadeErrorMessage({ _tag: "DisallowedCommand" })).toBe(
      "launch command not allowed",
    )
  })

  it("infers supported patch formats case-insensitively from the final suffix", () => {
    expect(supportedPatchFormatForPath("/patches/color.IPS")).toBe("ips")
    expect(supportedPatchFormatForPath("/patches/voice.BpS")).toBe("bps")
    expect(supportedPatchFormatForPath("/patches/qol.ups")).toBe("ups")
    expect(supportedPatchFormatForPath("/patches/hack.xdelta")).toBe("xdelta")
    expect(supportedPatchFormatForPath("/patches/no-extension")).toBe(undefined)
  })
})

function selectRocknixSource(lib: { readonly rootDir: string }): void {
  process.env.KORRI_LIBRARY_SOURCE = "rocknix"
  selectRocknixFallback(lib)
}

function selectRocknixFallback(lib: { readonly rootDir: string }): void {
  process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
  process.env.KORRI_ROCKNIX_ES_SYSTEMS_PATH = join(
    lib.rootDir,
    "missing-es-systems.cfg",
  )
}

async function expectListedGameNames(expected: string[]): Promise<void> {
  const games = await listGames()
  expect(games.map(game => game.metadata?.name)).toEqual(expected)
}

async function expectSourceListFailureMessage(message: string): Promise<void> {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const source = yield* LibrarySource
      return yield* source.list()
    }).pipe(Effect.provide(LibrarySourceLayerLive)),
  )

  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("expected failure")
  expect(Cause.squash(exit.cause)).toMatchObject({ message })
}

async function seedRocknixGamelists() {
  const lib = await withTempLibrary({
    systems: [
      {
        name: "snes",
        defaultEmulator: "retroarch",
        defaultCore: "snes9x",
        extension: [".smc"],
        games: [{ path: "echo.smc", name: "Layer Echo" }],
      },
    ],
  })
  cleanups.push(lib.cleanup)
  await rm(lib.esSystemsPath, { force: true })
  return lib
}

async function seedConfigGraph(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "korri-config-graph-live-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await writeConfigFragment(root, name)
  return root
}

async function writeConfigFragment(root: string, name: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, "local.korri.yaml"),
    [
      "storage:",
      "  fixtures:",
      "    root: /storage/fixtures",
      "sources:",
      "  fixtures:",
      "    kind: [files]",
      "    storage: fixtures",
      "systems:",
      "  fixture:",
      "    name: Fixture System",
      "library:",
      "  game-1:",
      `    title: ${name}`,
      "    source: fixtures",
      "    releases:",
      "      - id: r1",
      "        system: fixture",
      "        target: fixtures/game-1.rom",
      "",
    ].join("\n"),
    "utf8",
  )
}

async function listGames() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* LibrarySource
      return yield* source.list()
    }).pipe(Effect.provide(LibrarySourceLayerLive)),
  )
}

function restoreEnv(): void {
  setOptionalEnv("KORRI_DESKTOP_PROFILE", originalEnv.desktopProfile)
  setOptionalEnv("KORRI_LIBRARY_SOURCE", originalEnv.librarySource)
  setOptionalEnv("KORRI_CONFIG_ROOTS", originalEnv.configRoots)
  setOptionalEnv("HOME", originalEnv.home)
  setOptionalEnv("XDG_DATA_HOME", originalEnv.xdgDataHome)
  setOptionalEnv(
    "KORRI_ROCKNIX_GAMELIST_ROOTS",
    originalEnv.rocknixGamelistRoots,
  )
  setOptionalEnv(
    "KORRI_ROCKNIX_ES_SYSTEMS_PATH",
    originalEnv.rocknixEsSystemsPath,
  )
  setOptionalEnv("KORRI_ROCKNIX_MEDIA_ROOT", originalEnv.rocknixMediaRoot)
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
