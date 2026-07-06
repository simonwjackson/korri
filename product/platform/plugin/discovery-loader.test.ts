import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import type { PluginId } from "."
import {
  discoverPluginRoots,
  type PluginDiscoveryRoot,
} from "./discovery-loader"
import { createPluginRegistry } from "./registry"

const tempRoots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "korri-plugin-root-"))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })),
  )
})

function platformPluginImport(): string {
  return pathToFileURL(join(import.meta.dir, "index.ts")).href
}

async function writePluginModule(
  root: string,
  name: string,
  body: string,
): Promise<string> {
  const pluginDir = join(root, name)
  await Bun.$`mkdir -p ${pluginDir}`
  const entrypoint = join(pluginDir, "index.ts")
  await writeFile(entrypoint, body)
  return entrypoint
}

function pluginModule(input: {
  readonly namespace?: string
  readonly name: string
  readonly requires?: readonly PluginId[]
}): string {
  const requires = input.requires
    ? `requires: ${JSON.stringify(
        input.requires.map(provider => ({
          capability: "runtime.resolve",
          ref: { provider, id: "self" },
        })),
      )},`
    : ""
  return `
    import { plugin } from ${JSON.stringify(platformPluginImport())}

    export default plugin({
      namespace: ${JSON.stringify(input.namespace ?? "@local")},
      name: ${JSON.stringify(input.name)},
      title: ${JSON.stringify(input.name)},
      ${requires}
      contributes: {
        handlers: [
          {
            id: ${JSON.stringify(`${input.name}.diagnostics`)},
            operation: "diagnostics.collect",
            run: context => ({ provider: context.provider }),
          },
        ],
      },
    })
  `
}

function localRoot(path: string): PluginDiscoveryRoot {
  return { path, source: "local", devMode: true }
}

describe("discoverPluginRoots", () => {
  it("discovers valid default plugin exports from a root", async () => {
    const root = await tempRoot()
    await writePluginModule(root, "arcade", pluginModule({ name: "arcade" }))

    const result = await discoverPluginRoots([localRoot(root)])

    expect(result.diagnostics).toEqual([])
    expect(result.plugins.map(plugin => plugin.id)).toEqual(["@local:arcade"])
    expect(result.plugins[0]?.handlers.map(handler => handler.id)).toEqual([
      "arcade.diagnostics",
    ])
  })

  it("rejects local plugins that claim the reserved @korri namespace", async () => {
    const root = await tempRoot()
    await writePluginModule(
      root,
      "shadow",
      pluginModule({ namespace: "@korri", name: "shadow" }),
    )

    const result = await discoverPluginRoots([localRoot(root)])

    expect(result.plugins).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "reserved-namespace",
        pluginId: "@korri:shadow",
      }),
    ])
  })

  it("reports malformed modules without registering them", async () => {
    const root = await tempRoot()
    await writePluginModule(root, "broken", "export default { nope: true }")

    const result = await discoverPluginRoots([localRoot(root)])

    expect(result.plugins).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "invalid-plugin-module" }),
    ])
  })

  it("rejects plugin entrypoints that escape the canonical root through symlinks", async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    const outsideEntrypoint = await writePluginModule(
      outside,
      "outside",
      pluginModule({ name: "outside" }),
    )
    await Bun.$`mkdir -p ${join(root, "linked")}`
    await symlink(outsideEntrypoint, join(root, "linked", "index.ts"))

    const result = await discoverPluginRoots([localRoot(root)])

    expect(result.plugins).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "unsafe-entrypoint" }),
    ])
  })

  it("loads all descriptors before registry requirement expansion", async () => {
    const rootA = await tempRoot()
    const rootB = await tempRoot()
    await writePluginModule(
      rootA,
      "game",
      pluginModule({ name: "game", requires: ["@local:runtime"] }),
    )
    await writePluginModule(rootB, "runtime", pluginModule({ name: "runtime" }))

    const result = await discoverPluginRoots([
      localRoot(rootA),
      localRoot(rootB),
    ])
    const registry = createPluginRegistry(result.plugins, {
      enabledPluginIds: ["@local:game"],
    })

    expect(result.diagnostics).toEqual([])
    expect(registry.enabledPluginIds.has("@local:game")).toBe(true)
    expect(registry.enabledPluginIds.has("@local:runtime")).toBe(true)
  })
})
