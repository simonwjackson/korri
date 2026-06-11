import { afterEach, describe, expect, it } from "bun:test"
import { realpathSync } from "node:fs"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
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
import { createConfigGraphController } from "./config-graph-controller"
import { LibrarySource } from "./library-services"
import {
  LibrarySourceLayerLive,
  resolveAllConfigGraphRoots,
} from "./library-source-layer-live"
import { REMOVABLE_CONFIG_COLLECTIONS } from "./proseql/library-db"

const originalEnv = {
  desktopProfile: process.env.KORRI_DESKTOP_PROFILE,
  librarySource: process.env.KORRI_LIBRARY_SOURCE,
  configRoots: process.env.KORRI_CONFIG_ROOTS,
  configRootsDir: process.env.KORRI_CONFIG_ROOTS_DIR,
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
    const overlayRoot = await mkdtemp(join(tmpdir(), "korri-config-overlay-"))
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
  setOptionalEnv("KORRI_CONFIG_ROOTS_DIR", originalEnv.configRootsDir)
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

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

interface RemovableRig {
  readonly signalDir: string
  readonly mountsTablePath: string
  readonly staticRoot: string
}

async function seedRemovableRig(options: {
  readonly mounts: ReadonlyArray<{
    readonly entry: string
    readonly target: string
    readonly options?: string
    readonly inMountTable?: boolean
  }>
}): Promise<RemovableRig> {
  const staticRoot = await seedConfigGraph("Static Echo")
  const signalDir = await makeTempDir("korri-config-roots-d-")
  const tableDir = await makeTempDir("korri-mounts-table-")
  const mountsTablePath = join(tableDir, "mounts")

  const lines: string[] = []
  for (const mount of options.mounts) {
    await symlink(mount.target, join(signalDir, mount.entry))
    if (mount.inMountTable ?? true) {
      lines.push(
        `/dev/${mount.entry} ${realpathSync(mount.target)} vfat ${mount.options ?? "rw,noexec,nosuid"} 0 0`,
      )
    }
  }
  await writeFile(mountsTablePath, `${lines.join("\n")}\n`, "utf8")

  process.env.KORRI_LIBRARY_SOURCE = "proseql"
  process.env.KORRI_CONFIG_ROOTS = staticRoot
  process.env.KORRI_CONFIG_ROOTS_DIR = signalDir

  return { signalDir, mountsTablePath, staticRoot }
}

describe("resolveAllConfigGraphRoots", () => {
  it("appends sorted signal-dir mounts after static roots with removable classification", async () => {
    const mountB = await makeTempDir("korri-removable-b-")
    const mountA = await makeTempDir("korri-removable-a-")
    const rig = await seedRemovableRig({
      mounts: [
        { entry: "sdb1", target: mountB, options: "ro,noexec,nosuid" },
        { entry: "mmcblk1p1", target: mountA },
      ],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots.map(root => root.root)).toEqual([
      rig.staticRoot,
      realpathSync(mountA),
      realpathSync(mountB),
    ])
    const [staticRoot, removableA, removableB] = roots
    expect(staticRoot?.collections).toBeUndefined()
    expect(removableA).toMatchObject({
      id: "removable-mmcblk1p1",
      optional: true,
      writable: true,
      collections: REMOVABLE_CONFIG_COLLECTIONS,
    })
    expect(removableB).toMatchObject({
      id: "removable-sdb1",
      optional: true,
      writable: false,
      collections: REMOVABLE_CONFIG_COLLECTIONS,
    })
  })

  it("classifies an exact 'rw' option string as writable", async () => {
    const mount = await makeTempDir("korri-removable-rw-")
    const rig = await seedRemovableRig({
      mounts: [{ entry: "sda1", target: mount, options: "rw" }],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots[1]).toMatchObject({
      root: realpathSync(mount),
      writable: true,
    })
  })

  it("decodes octal-escaped mount targets from the mount table", async () => {
    const parent = await makeTempDir("korri-removable-octal-")
    const mount = join(parent, "My Card")
    await mkdir(mount)
    const rig = await seedRemovableRig({ mounts: [] })
    await symlink(mount, join(rig.signalDir, "sda1"))
    // /proc/mounts escapes spaces in path fields as \040.
    await writeFile(
      rig.mountsTablePath,
      `/dev/sda1 ${realpathSync(mount).replaceAll(" ", "\\040")} vfat rw,noexec 0 0\n`,
      "utf8",
    )

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots.map(root => root.root)).toEqual([
      rig.staticRoot,
      realpathSync(mount),
    ])
  })

  it("returns only static roots when KORRI_CONFIG_ROOTS_DIR is unset", async () => {
    const staticRoot = await seedConfigGraph("Static Echo")
    process.env.KORRI_CONFIG_ROOTS = staticRoot
    delete process.env.KORRI_CONFIG_ROOTS_DIR

    const roots = resolveAllConfigGraphRoots(process.env)

    expect(roots.map(root => root.root)).toEqual([staticRoot])
  })

  it("skips dangling symlinks and entries that are not live mounts", async () => {
    const liveMount = await makeTempDir("korri-removable-live-")
    const staleDir = await makeTempDir("korri-removable-stale-")
    const rig = await seedRemovableRig({
      mounts: [
        { entry: "sda1", target: liveMount },
        {
          entry: "sdb1",
          target: join(staleDir, "vanished"),
          inMountTable: false,
        },
        { entry: "sdc1", target: staleDir, inMountTable: false },
      ],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots.map(root => root.root)).toEqual([
      rig.staticRoot,
      realpathSync(liveMount),
    ])
  })

  it("contributes no dynamic roots when the mounts table is unreadable (fail-safe)", async () => {
    const mount = await makeTempDir("korri-removable-x-")
    const rig = await seedRemovableRig({
      mounts: [{ entry: "sda1", target: mount }],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: join(rig.mountsTablePath, "missing"),
    })

    expect(roots.map(root => root.root)).toEqual([rig.staticRoot])
  })

  it("feeds the config-graph controller end to end: a new signal-dir mount joins the live graph", async () => {
    const mount = await makeTempDir("korri-removable-card-")
    await writeFile(
      join(mount, "card.korri.yaml"),
      [
        "library:",
        "  card-game:",
        "    title: Card Echo",
        "    releases:",
        "      - id: r1",
        "        system: fixture",
        "        target: fixtures/card.rom",
        "",
      ].join("\n"),
      "utf8",
    )
    const rig = await seedRemovableRig({ mounts: [] })
    await writeFile(
      rig.mountsTablePath,
      `/dev/sda1 ${realpathSync(mount)} vfat rw,noexec 0 0\n`,
      "utf8",
    )

    const controller = createConfigGraphController({
      resolveRoots: () =>
        resolveAllConfigGraphRoots(process.env, {
          mountsTablePath: rig.mountsTablePath,
        }),
      rootsSignalDir: rig.signalDir,
      watch: true,
      debounceMs: 25,
    })
    const ready = await controller.initialize()
    expect(ready.files).toEqual(["local.korri.yaml"])

    const changed = new Promise<readonly string[] | undefined>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("timed out waiting for config.changed")),
          2000,
        )
        controller.subscribe(event => {
          if (event.name !== "config.changed") return
          clearTimeout(timeout)
          resolve(event.files)
        })
      },
    )

    await symlink(mount, join(rig.signalDir, "sda1"))
    const files = await changed

    expect(files).toEqual(["card.korri.yaml", "local.korri.yaml"])
    const snapshot = await controller.snapshot()
    expect(snapshot.map(entry => entry.id).sort()).toEqual([
      "card-game",
      "game-1",
    ])
    await controller.stop()
  })
})
