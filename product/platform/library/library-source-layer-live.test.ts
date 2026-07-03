import { afterEach, describe, expect, it } from "bun:test"
import { realpathSync } from "node:fs"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
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
  createControllerBackedLibrarySourceService,
  LibrarySourceLayerLive,
  resolveAllConfigGraphRoots,
} from "./library-source-layer-live"
import { REMOVABLE_CONFIG_COLLECTIONS } from "./proseql/config-graph-db"

const originalEnv = {
  desktopProfile: process.env.KORRI_DESKTOP_PROFILE,
  configRoots: process.env.KORRI_CONFIG_ROOTS,
  configRootsDir: process.env.KORRI_CONFIG_ROOTS_DIR,
  removableMediaRoot: process.env.KORRI_REMOVABLE_MEDIA_ROOT,
  home: process.env.HOME,
  xdgDataHome: process.env.XDG_DATA_HOME,
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
  it("reads ordered config roots and lets later roots win", async () => {
    const baseRoot = await seedConfigGraph("Base Echo")
    const overlayRoot = await mkdtemp(join(tmpdir(), "korri-config-overlay-"))
    cleanups.push(() => rm(overlayRoot, { recursive: true, force: true }))
    await writeConfigFragment(overlayRoot, "Overlay Echo")
    delete process.env.KORRI_DESKTOP_PROFILE
    process.env.KORRI_CONFIG_ROOTS = `${baseRoot}:${overlayRoot}`

    await expectListedGameNames(["Overlay Echo"])
  })

  it("defaults the config graph to the XDG config root", async () => {
    const home = await mkdtemp(join(tmpdir(), "korri-library-source-home-"))
    cleanups.push(() => rm(home, { recursive: true, force: true }))
    delete process.env.KORRI_CONFIG_ROOTS
    delete process.env.XDG_DATA_HOME
    process.env.HOME = home

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

    await expectListedGameNames([])
  })

  it("treats an explicitly empty KORRI_CONFIG_ROOTS as a valid empty catalog", async () => {
    process.env.KORRI_CONFIG_ROOTS = ""

    await expectListedGameNames([])
  })

  it("serves controller-backed proseql calls from the active graph instead of current env roots", async () => {
    const root = await seedConfigGraph("Controller Echo")
    const controller = createConfigGraphController({
      roots: [{ root }],
      watch: false,
    })
    await controller.initialize()
    process.env.KORRI_CONFIG_ROOTS = join(root, "missing-now")

    const source = createControllerBackedLibrarySourceService({ controller })
    if (!source.listPlayableEntries) {
      throw new Error("expected playable list support")
    }
    const entries = await Effect.runPromise(source.listPlayableEntries())
    const resolved = await Effect.runPromise(
      source.resolveLaunchForGame("game-1"),
    )

    expect(entries.map(entry => entry.title)).toEqual(["Controller Echo"])
    expect(resolved.spec.command).toBe("/bin/echo")
    await controller.stop()
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

async function expectListedGameNames(expected: string[]): Promise<void> {
  const games = await listGames()
  expect(games.map(game => game.metadata?.name)).toEqual(expected)
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
      "launchers:",
      "  fixture-launcher:",
      "    command: /bin/echo",
      "    args: ['{content.path}']",
      "library:",
      "  game-1:",
      `    title: ${name}`,
      "    source: fixtures",
      "    releases:",
      "      - id: r1",
      "        system: fixture",
      "        target: { kind: file, storage: fixtures, path: game-1.rom }",
      "        launch: { use: fixture-launcher }",
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
  setOptionalEnv("KORRI_CONFIG_ROOTS", originalEnv.configRoots)
  setOptionalEnv("KORRI_CONFIG_ROOTS_DIR", originalEnv.configRootsDir)
  setOptionalEnv("KORRI_REMOVABLE_MEDIA_ROOT", originalEnv.removableMediaRoot)
  setOptionalEnv("HOME", originalEnv.home)
  setOptionalEnv("XDG_DATA_HOME", originalEnv.xdgDataHome)
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
  readonly mediaRoot: string
}

async function seedRemovableRig(options: {
  readonly mediaRoot?: string
  readonly mounts: ReadonlyArray<{
    readonly entry: string
    readonly target: string
    readonly mountPoint?: string
    readonly options?: string
    readonly inMountTable?: boolean
  }>
}): Promise<RemovableRig> {
  const staticRoot = await seedConfigGraph("Static Echo")
  const signalDir = await makeTempDir("korri-config-roots-d-")
  const mediaRoot =
    options.mediaRoot ?? (await makeTempDir("korri-media-root-"))
  const tableDir = await makeTempDir("korri-mounts-table-")
  const mountsTablePath = join(tableDir, "mounts")

  const lines: string[] = []
  for (const mount of options.mounts) {
    await symlink(mount.target, join(signalDir, mount.entry))
    if (mount.inMountTable ?? true) {
      lines.push(
        `/dev/${mount.entry} ${realpathSync(mount.mountPoint ?? mount.target)} vfat ${mount.options ?? "rw,noexec,nosuid"} 0 0`,
      )
    }
  }
  await writeFile(mountsTablePath, `${lines.join("\n")}\n`, "utf8")

  process.env.KORRI_CONFIG_ROOTS = staticRoot
  process.env.KORRI_CONFIG_ROOTS_DIR = signalDir
  process.env.KORRI_REMOVABLE_MEDIA_ROOT = mediaRoot

  return { signalDir, mountsTablePath, staticRoot, mediaRoot }
}

describe("resolveAllConfigGraphRoots", () => {
  async function makeMountedAnchor(
    mediaRoot: string,
    mediaId: string,
    anchor = ".korri",
  ): Promise<{ readonly mount: string; readonly anchor: string }> {
    const mount = join(mediaRoot, mediaId)
    const anchorDir = join(mount, anchor)
    await mkdir(anchorDir, { recursive: true })
    return { mount, anchor: anchorDir }
  }

  it("appends sorted signal-dir anchors after static roots with removable classification", async () => {
    const mediaRoot = await makeTempDir("korri-media-root-")
    const cardB = await makeMountedAnchor(mediaRoot, "card-b")
    const cardA = await makeMountedAnchor(mediaRoot, "card-a")
    const rig = await seedRemovableRig({
      mediaRoot,
      mounts: [
        {
          entry: "card-b-dot-korri",
          target: cardB.anchor,
          mountPoint: cardB.mount,
          options: "ro,noexec,nosuid",
        },
        {
          entry: "card-a-dot-korri",
          target: cardA.anchor,
          mountPoint: cardA.mount,
        },
      ],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots.map(root => root.root)).toEqual([
      rig.staticRoot,
      realpathSync(cardA.anchor),
      realpathSync(cardB.anchor),
    ])
    const [staticRoot, removableA, removableB] = roots
    expect(staticRoot?.collections).toBeUndefined()
    expect(removableA).toMatchObject({
      id: "removable-card-a-dot-korri",
      optional: true,
      writable: true,
      collections: REMOVABLE_CONFIG_COLLECTIONS,
    })
    expect(removableB).toMatchObject({
      id: "removable-card-b-dot-korri",
      optional: true,
      writable: false,
      collections: REMOVABLE_CONFIG_COLLECTIONS,
    })
  })

  it("classifies an exact 'rw' option string as writable for nested anchors", async () => {
    const mediaRoot = await makeTempDir("korri-media-root-")
    const card = await makeMountedAnchor(mediaRoot, "card-rw")
    const rig = await seedRemovableRig({
      mediaRoot,
      mounts: [
        {
          entry: "card-rw-dot-korri",
          target: card.anchor,
          mountPoint: card.mount,
          options: "rw",
        },
      ],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots[1]).toMatchObject({
      root: realpathSync(card.anchor),
      writable: true,
    })
  })

  it("decodes octal-escaped mount targets from the mount table", async () => {
    const mediaRoot = await makeTempDir("korri-media-root-")
    const mount = join(mediaRoot, "My Card")
    const anchor = join(mount, ".korri")
    await mkdir(anchor, { recursive: true })
    const rig = await seedRemovableRig({ mediaRoot, mounts: [] })
    await symlink(anchor, join(rig.signalDir, "my-card-dot-korri"))
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
      realpathSync(anchor),
    ])
  })

  it("returns only static roots when KORRI_CONFIG_ROOTS_DIR is unset", async () => {
    const staticRoot = await seedConfigGraph("Static Echo")
    process.env.KORRI_CONFIG_ROOTS = staticRoot
    delete process.env.KORRI_CONFIG_ROOTS_DIR

    const roots = resolveAllConfigGraphRoots(process.env)

    expect(roots.map(root => root.root)).toEqual([staticRoot])
  })

  it("skips dangling, non-live, whole-mount, and outside-media entries", async () => {
    const mediaRoot = await makeTempDir("korri-media-root-")
    const live = await makeMountedAnchor(mediaRoot, "live-card")
    const wholeMount = join(mediaRoot, "whole-card")
    await mkdir(wholeMount, { recursive: true })
    const outside = await makeTempDir("korri-outside-media-")
    const staleDir = await makeTempDir("korri-removable-stale-")
    const rig = await seedRemovableRig({
      mediaRoot,
      mounts: [
        {
          entry: "live-card-dot-korri",
          target: live.anchor,
          mountPoint: live.mount,
        },
        {
          entry: "whole-card",
          target: wholeMount,
          mountPoint: wholeMount,
        },
        { entry: "outside-dot-korri", target: outside },
        {
          entry: "dangling-dot-korri",
          target: join(staleDir, "vanished"),
          inMountTable: false,
        },
      ],
    })

    const roots = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
    })

    expect(roots.map(root => root.root)).toEqual([
      rig.staticRoot,
      realpathSync(live.anchor),
    ])
  })

  it("contributes no dynamic roots when the media root or mounts table is unreadable", async () => {
    const mediaRoot = await makeTempDir("korri-media-root-")
    const card = await makeMountedAnchor(mediaRoot, "card-x")
    const rig = await seedRemovableRig({
      mediaRoot,
      mounts: [
        {
          entry: "card-x-dot-korri",
          target: card.anchor,
          mountPoint: card.mount,
        },
      ],
    })

    const missingTable = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: join(rig.mountsTablePath, "missing"),
    })
    expect(missingTable.map(root => root.root)).toEqual([rig.staticRoot])

    const missingMediaRoot = resolveAllConfigGraphRoots(process.env, {
      mountsTablePath: rig.mountsTablePath,
      removableMediaRoot: join(mediaRoot, "missing"),
    })
    expect(missingMediaRoot.map(root => root.root)).toEqual([rig.staticRoot])
  })

  it("feeds the config-graph controller end to end: a new signal-dir anchor joins the live graph", async () => {
    const mediaRoot = await makeTempDir("korri-media-root-")
    const card = await makeMountedAnchor(mediaRoot, "card-live")
    await writeFile(
      join(card.anchor, "card.korri.yaml"),
      [
        "library:",
        "  card-game:",
        "    title: Card Echo",
        "    releases:",
        "      - id: r1",
        "        system: fixture",
        "        target: { kind: file, storage: fixtures, path: card.rom }",
        "        launch: { use: fixture-launcher }",
        "",
      ].join("\n"),
      "utf8",
    )
    const rig = await seedRemovableRig({ mediaRoot, mounts: [] })
    await writeFile(
      rig.mountsTablePath,
      `/dev/sda1 ${realpathSync(card.mount)} vfat rw,noexec 0 0\n`,
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

    await symlink(card.anchor, join(rig.signalDir, "card-live-dot-korri"))
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
