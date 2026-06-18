import { describe, expect, it } from "bun:test"
import { chmod, mkdir, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
import { Effect } from "effect"
import { type ExecutablePluginResource, plugin } from "."
import { withPluginLibrarySource } from "./catalog-library-source"
import { createPluginRegistry } from "./registry"
import {
  createNixOutLinkResolver,
  outLinkPath,
  PluginResourceFulfillmentFailed,
} from "./resources"

const resource: ExecutablePluginResource = {
  id: "neverball",
  kind: "executable",
  fulfill: {
    provider: "nix",
    installable: "nixpkgs#neverball",
    binary: "neverball",
  },
}

const neverball = plugin({
  namespace: "@korri",
  name: "neverball",
  title: "Neverball",
  contributes: {
    config: {
      catalog: {
        neverball: {
          id: "neverball",
          title: "Neverball",
          kind: "game",
          releases: [
            {
              id: "nixpkgs",
              launch: {
                kind: "process",
                executable: { resource: resource.id },
              },
            },
          ],
        },
      },
      modules: { neverball: resource },
    },
  },
})

describe("withPluginLibrarySource", () => {
  it("lists enabled plugin playables through both list contracts", async () => {
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([neverball], {
        enabledPluginIds: ["@korri:neverball"],
      }),
      createNixOutLinkResolver({ stateRoot: await mktemp() }),
    )

    await expect(Effect.runPromise(source.list())).resolves.toMatchObject([
      { id: "@korri:neverball/neverball", metadata: { name: "Neverball" } },
    ])
    const listPlayableEntries = source.listPlayableEntries
    if (!listPlayableEntries) throw new Error("expected playable list support")
    await expect(
      Effect.runPromise(listPlayableEntries()),
    ).resolves.toMatchObject([
      { id: "@korri:neverball/neverball", title: "Neverball" },
    ])
  })

  it("does not list available but disabled plugin playables", async () => {
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([neverball]),
      createNixOutLinkResolver({ stateRoot: await mktemp() }),
    )

    await expect(Effect.runPromise(source.list())).resolves.toEqual([])
  })

  it("resolves a fulfilled process to an absolute launch spec", async () => {
    const stateRoot = await mktemp()
    await seedExecutable(stateRoot)
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([neverball], {
        enabledPluginIds: ["@korri:neverball"],
      }),
      createNixOutLinkResolver({ stateRoot }),
    )

    const resolved = await Effect.runPromise(
      source.resolveLaunchForGame("@korri:neverball/neverball"),
    )

    expect(resolved.spec).toEqual({
      command: join(
        stateRoot,
        "x406b6f7272693a6e6576657262616c6c",
        "x6e6576657262616c6c",
        "result",
        "bin",
        "neverball",
      ),
      args: [],
    })
    expect(resolved.app).toBeUndefined()
  })

  it("maps provider launch options to the resolved companion map", async () => {
    const stateRoot = await mktemp()
    await seedExecutable(stateRoot)
    const withPolicy = plugin({
      namespace: "@korri",
      name: "neverball",
      title: "Policy",
      contributes: {
        config: {
          catalog: {
            policy: {
              id: "policy",
              title: "Policy",
              kind: "game",
              releases: [
                {
                  id: "nixpkgs",
                  launch: {
                    kind: "process",
                    executable: { resource: resource.id },
                    with: { "@fixture:frame": { enable: false } },
                  },
                },
              ],
            },
          },
          modules: { neverball: resource },
        },
      },
    })
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([withPolicy], {
        enabledPluginIds: ["@korri:neverball"],
      }),
      createNixOutLinkResolver({ stateRoot }),
    )

    const resolved = await Effect.runPromise(
      source.resolveLaunchForGame("@korri:neverball/policy"),
    )

    expect(resolved.launchCompanions).toEqual({
      "@fixture:frame": { enable: false },
    })
  })

  it("preserves multiple provider launch option payload shapes", async () => {
    const stateRoot = await mktemp()
    await seedExecutable(stateRoot)
    const multiPolicy = plugin({
      namespace: "@korri",
      name: "neverball",
      title: "Policy",
      contributes: {
        config: {
          catalog: {
            policy: {
              id: "policy",
              title: "Policy",
              kind: "game",
              releases: [
                {
                  id: "nixpkgs",
                  launch: {
                    kind: "process",
                    executable: { resource: resource.id },
                    with: {
                      "@fixture:frame": { quality: "balanced" },
                      "@fixture:telemetry": { sampleRate: 10 },
                    },
                  },
                },
              ],
            },
          },
          modules: { neverball: resource },
        },
      },
    })
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([multiPolicy], {
        enabledPluginIds: ["@korri:neverball"],
      }),
      createNixOutLinkResolver({ stateRoot }),
    )

    const resolved = await Effect.runPromise(
      source.resolveLaunchForGame("@korri:neverball/policy"),
    )

    expect(resolved.launchCompanions).toEqual({
      "@fixture:frame": { quality: "balanced" },
      "@fixture:telemetry": { sampleRate: 10 },
    })
  })

  it("ignores malformed generic catalog records instead of treating them as plugin playables", async () => {
    const malformed = plugin({
      namespace: "@korri",
      name: "malformed",
      title: "Malformed",
      contributes: {
        config: {
          catalog: {
            broken: {
              id: "broken",
              title: "Broken",
              kind: "game",
              releases: [{ id: "bad", launch: { kind: "process" } }],
            } as never,
          },
        },
      },
    })
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([malformed], {
        enabledPluginIds: ["@korri:malformed"],
      }),
      createNixOutLinkResolver({ stateRoot: await mktemp() }),
    )

    await expect(Effect.runPromise(source.list())).resolves.toEqual([])
    const error = await Effect.runPromise(
      Effect.flip(source.resolveLaunchForGame("@korri:malformed/broken")),
    )
    expect(error).toBeInstanceOf(LibraryError)
    expect(error.message).toBe("missing @korri:malformed/broken")
  })

  it("fails closed when a matched plugin playable has an invalid descriptor", async () => {
    const invalid = plugin({
      namespace: "@korri",
      name: "broken",
      title: "Broken",
      contributes: {
        config: {
          catalog: {
            broken: {
              id: "broken",
              title: "Broken",
              kind: "game",
              releases: [
                {
                  id: "nixpkgs",
                  launch: {
                    kind: "process",
                    executable: { resource: "missing-resource" },
                  },
                },
              ],
            },
          },
        },
      },
    })
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([invalid], { enabledPluginIds: ["@korri:broken"] }),
      createNixOutLinkResolver({ stateRoot: await mktemp() }),
    )

    const error = await Effect.runPromise(
      Effect.flip(source.resolveLaunchForGame("@korri:broken/broken")),
    )

    expect(error).toBeInstanceOf(LibraryError)
    expect(error.diagnostic).toBe(
      "missing executable resource missing-resource",
    )
  })

  it("surfaces fulfillment failure diagnostics from plugin resource resolution", async () => {
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([neverball], {
        enabledPluginIds: ["@korri:neverball"],
      }),
      {
        resolveExecutable: ({ pluginId, resource }) =>
          Effect.fail(
            new PluginResourceFulfillmentFailed({
              pluginId,
              resourceId: resource.id,
              message: "nix build failed: no substituter",
            }),
          ),
      },
    )

    const error = await Effect.runPromise(
      Effect.flip(source.resolveLaunchForGame("@korri:neverball/neverball")),
    )

    expect(error).toBeInstanceOf(LibraryError)
    expect(error.diagnostic).toBe("nix build failed: no substituter")
  })

  it("keeps missing-resource playables visible but not launch-resolvable", async () => {
    const source = withPluginLibrarySource(
      emptySource(),
      createPluginRegistry([neverball], {
        enabledPluginIds: ["@korri:neverball"],
      }),
      createNixOutLinkResolver({ stateRoot: await mktemp() }),
    )

    await expect(Effect.runPromise(source.list())).resolves.toMatchObject([
      { id: "@korri:neverball/neverball" },
    ])
    await expect(
      Effect.runPromise(source.launchSpecFor("@korri:neverball/neverball")),
    ).resolves.toBeUndefined()
    const canResolveLaunchForGame = source.canResolveLaunchForGame
    if (!canResolveLaunchForGame) {
      throw new Error("expected canResolveLaunchForGame support")
    }
    await expect(
      Effect.runPromise(canResolveLaunchForGame("@korri:neverball/neverball")),
    ).resolves.toBe(false)

    const exit = await Effect.runPromiseExit(
      source.resolveLaunchForGame("@korri:neverball/neverball"),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("not fulfilled")
    }
  })
})

function emptySource(): LibrarySourceService {
  return {
    list: () => Effect.succeed([]),
    listPlayableEntries: () => Effect.succeed([]),
    launchSpecFor: () => Effect.succeed(undefined),
    canResolveLaunchForGame: () => Effect.succeed(false),
    resolveLaunchForGame: id =>
      Effect.fail(
        new LibraryError({ reason: "config", message: `missing ${id}` }),
      ),
  }
}

async function mktemp(): Promise<string> {
  return await import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-plugin-catalog-")),
  )
}

async function seedExecutable(stateRoot: string): Promise<void> {
  const store = join(stateRoot, "store-neverball")
  await mkdir(join(store, "bin"), { recursive: true })
  const executable = join(store, "bin", "neverball")
  await Bun.write(executable, "#!/bin/sh\n")
  await chmod(executable, 0o755)
  const link = outLinkPath(stateRoot, "@korri:neverball", resource.id)
  await mkdir(join(link, ".."), { recursive: true })
  await symlink(store, link)
}
