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
          "x6e6576657262616c6c2d65786563757461626c65",
          "result",
          "bin",
          "neverball",
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
  const store = join(stateRoot, "store-neverball")
  await mkdir(join(store, "bin"), { recursive: true })
  const executable = join(store, "bin", "neverball")
  await Bun.write(executable, "#!/bin/sh\n")
  await chmod(executable, 0o755)
  const link = outLinkPath(
    stateRoot,
    "@korri:neverball",
    "neverball-executable",
  )
  await mkdir(join(link, ".."), { recursive: true })
  await symlink(store, link)
}
