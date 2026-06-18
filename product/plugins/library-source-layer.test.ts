import { describe, expect, it } from "bun:test"
import { access, chmod, mkdir, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LibrarySource } from "@platform/library/library-services"
import { outLinkPath } from "@platform/plugin/resources"
import { Effect } from "effect"
import {
  createPluginResourceFulfillerFromEnv,
  PluginLibrarySourceLayerLive,
} from "./library-source-layer"

describe("PluginLibrarySourceLayerLive", () => {
  it("exposes the enabled Neverball plugin through the live library source", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    await seedNeverballExecutable(stateRoot)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:neverball"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const resolved = yield* source.resolveLaunchForGame(
            "@korri:neverball/neverball",
          )
          return { entries, resolved }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(result.entries.map(entry => entry.id)).toContain(
        "@korri:neverball/neverball",
      )
      expect(result.resolved.spec.command).toBe(
        join(
          stateRoot,
          "x406b6f7272693a6e6576657262616c6c",
          "x6e6576657262616c6c",
          "result",
          "bin",
          "neverball",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("exposes the enabled Mega Man Arena plugin through fulfilled resources", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    await seedMegaManArenaExecutable(stateRoot)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:mega-man-arena"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const resolved = yield* source.resolveLaunchForGame(
            "@korri:mega-man-arena/mega-man-arena",
          )
          return { entries, resolved }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(result.entries.map(entry => entry.id)).toContain(
        "@korri:mega-man-arena/mega-man-arena",
      )
      expect(result.resolved.spec.command).toBe(
        join(
          stateRoot,
          "x406b6f7272693a6d6567612d6d616e2d6172656e61",
          "x6d6567612d6d616e2d6172656e61",
          "result",
          "bin",
          "mega-man-arena",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("exposes the enabled Mega Man Maker plugin through fulfilled resources", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    await seedMegaManMakerExecutable(stateRoot)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:mega-man-maker"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const resolved = yield* source.resolveLaunchForGame(
            "@korri:mega-man-maker/mega-man-maker",
          )
          return { entries, resolved }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(result.entries.map(entry => entry.id)).toContain(
        "@korri:mega-man-maker/mega-man-maker",
      )
      expect(result.resolved.spec.command).toBe(
        join(
          stateRoot,
          "x406b6f7272693a6d6567612d6d616e2d6d616b6572",
          "x6d6567612d6d616e2d6d616b6572",
          "result",
          "bin",
          "mega-man-maker",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("exposes the enabled Midas Machine plugin through fulfilled resources", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    await seedMidasMachineExecutable(stateRoot)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:midas-machine"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const resolved = yield* source.resolveLaunchForGame(
            "@korri:midas-machine/midas-machine",
          )
          return { entries, resolved }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(result.entries.map(entry => entry.id)).toContain(
        "@korri:midas-machine/midas-machine",
      )
      expect(result.resolved.spec.command).toBe(
        join(
          stateRoot,
          "x406b6f7272693a6d696461732d6d616368696e65",
          "x6d696461732d6d616368696e65",
          "result",
          "bin",
          "midas-machine",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("exposes the enabled SRB2 plugin through fulfilled resources", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    await seedSrb2Executable(stateRoot)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:srb2"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const resolved =
            yield* source.resolveLaunchForGame("@korri:srb2/srb2")
          return { entries, resolved }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(result.entries.map(entry => entry.id)).toContain(
        "@korri:srb2/srb2",
      )
      expect(result.resolved.spec.command).toBe(
        join(
          stateRoot,
          "x406b6f7272693a73726232",
          "x73726232",
          "result",
          "bin",
          "srb2",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("exposes the enabled Psycho Waluigi plugin through fulfilled resources", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    await seedPsychoWaluigiExecutable(stateRoot)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:psycho-waluigi"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const resolved = yield* source.resolveLaunchForGame(
            "@korri:psycho-waluigi/psycho-waluigi",
          )
          return { entries, resolved }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(result.entries.map(entry => entry.id)).toContain(
        "@korri:psycho-waluigi/psycho-waluigi",
      )
      expect(result.resolved.spec.command).toBe(
        join(
          stateRoot,
          "x406b6f7272693a70737963686f2d77616c75696769",
          "x70737963686f2d77616c75696769",
          "result",
          "bin",
          "psycho-waluigi",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("keeps launch resolution read-only even when a Nix command is configured", async () => {
    const previous = snapshotEnv()
    const stateRoot = await mktemp()
    const sentinel = join(stateRoot, "nix-was-spawned")
    const fakeNix = join(stateRoot, "fake-nix")
    await Bun.write(
      fakeNix,
      `#!/bin/sh\nprintf spawned > ${JSON.stringify(sentinel)}\n`,
    )
    await chmod(fakeNix, 0o755)
    process.env.KORRI_CONFIG_ROOTS = ""
    process.env.KORRI_ENABLED_PLUGINS = "@korri:neverball"
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = stateRoot
    process.env.KORRI_NIX_COMMAND = fakeNix
    try {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const source = yield* LibrarySource
          const listPlayableEntries = source.listPlayableEntries
          if (!listPlayableEntries)
            throw new Error("expected playable list support")
          const entries = yield* listPlayableEntries()
          const launchSpec = yield* source.launchSpecFor(
            "@korri:neverball/neverball",
          )
          const canResolve = source.canResolveLaunchForGame
            ? yield* source.canResolveLaunchForGame(
                "@korri:neverball/neverball",
              )
            : true
          return { entries, launchSpec, canResolve }
        }).pipe(Effect.provide(PluginLibrarySourceLayerLive)),
      )

      expect(exit._tag).toBe("Success")
      if (exit._tag === "Success") {
        expect(exit.value.entries.map(entry => entry.id)).toContain(
          "@korri:neverball/neverball",
        )
        expect(exit.value.launchSpec).toBeUndefined()
        expect(exit.value.canResolve).toBe(false)
      }
      await expect(access(sentinel)).rejects.toThrow()
    } finally {
      restoreEnv(previous)
    }
  })

  it("creates an explicit resource fulfiller from the host Nix command", async () => {
    const stateRoot = await mktemp()
    const fulfiller = createPluginResourceFulfillerFromEnv({
      KORRI_PLUGIN_RESOURCE_ROOT: stateRoot,
      KORRI_NIX_COMMAND: "/nix/store/hash-nix/bin/nix",
    } as NodeJS.ProcessEnv)

    expect(fulfiller).toBeDefined()
  })
})

function snapshotEnv() {
  return {
    KORRI_CONFIG_ROOTS: process.env.KORRI_CONFIG_ROOTS,
    KORRI_ENABLED_PLUGINS: process.env.KORRI_ENABLED_PLUGINS,
    KORRI_PLUGIN_RESOURCE_ROOT: process.env.KORRI_PLUGIN_RESOURCE_ROOT,
    KORRI_NIX_COMMAND: process.env.KORRI_NIX_COMMAND,
  }
}

function restoreEnv(previous: ReturnType<typeof snapshotEnv>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function mktemp(): Promise<string> {
  return await import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-plugin-live-")),
  )
}

async function seedNeverballExecutable(stateRoot: string): Promise<void> {
  await seedExecutableResource({
    stateRoot,
    pluginId: "@korri:neverball",
    resourceId: "neverball",
    binary: "neverball",
    storeName: "store-neverball",
  })
}

async function seedMegaManArenaExecutable(stateRoot: string): Promise<void> {
  await seedExecutableResource({
    stateRoot,
    pluginId: "@korri:mega-man-arena",
    resourceId: "mega-man-arena",
    binary: "mega-man-arena",
    storeName: "store-mega-man-arena",
  })
}

async function seedMegaManMakerExecutable(stateRoot: string): Promise<void> {
  await seedExecutableResource({
    stateRoot,
    pluginId: "@korri:mega-man-maker",
    resourceId: "mega-man-maker",
    binary: "mega-man-maker",
    storeName: "store-mega-man-maker",
  })
}

async function seedMidasMachineExecutable(stateRoot: string): Promise<void> {
  await seedExecutableResource({
    stateRoot,
    pluginId: "@korri:midas-machine",
    resourceId: "midas-machine",
    binary: "midas-machine",
    storeName: "store-midas-machine",
  })
}

async function seedSrb2Executable(stateRoot: string): Promise<void> {
  await seedExecutableResource({
    stateRoot,
    pluginId: "@korri:srb2",
    resourceId: "srb2",
    binary: "srb2",
    storeName: "store-srb2",
  })
}

async function seedPsychoWaluigiExecutable(stateRoot: string): Promise<void> {
  await seedExecutableResource({
    stateRoot,
    pluginId: "@korri:psycho-waluigi",
    resourceId: "psycho-waluigi",
    binary: "psycho-waluigi",
    storeName: "store-psycho-waluigi",
  })
}

async function seedExecutableResource(input: {
  readonly stateRoot: string
  readonly pluginId: `@${string}:${string}`
  readonly resourceId: string
  readonly binary: string
  readonly storeName: string
}): Promise<void> {
  const store = join(input.stateRoot, input.storeName)
  await mkdir(join(store, "bin"), { recursive: true })
  const executable = join(store, "bin", input.binary)
  await Bun.write(executable, "#!/bin/sh\n")
  await chmod(executable, 0o755)
  const link = outLinkPath(input.stateRoot, input.pluginId, input.resourceId)
  await mkdir(join(link, ".."), { recursive: true })
  await symlink(store, link)
}
