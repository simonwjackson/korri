import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { KORRI_STEAM_PLUGIN_ID } from "@product/plugins/steam"
import {
  createFirstPartyPluginState,
  createFirstPartyPluginStateWithLocalRoots,
  resetFirstPartyPluginStateForTests,
} from "./state"

const tempRoots: string[] = []

afterEach(async () => {
  resetFirstPartyPluginStateForTests()
  await Promise.all(
    tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })),
  )
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "korri-plugin-state-"))
  tempRoots.push(root)
  return root
}

function platformPluginImport(): string {
  return pathToFileURL(join(import.meta.dir, "../platform/plugin/index.ts"))
    .href
}

async function writeLocalPlugin(input: {
  readonly root: string
  readonly namespace?: string
  readonly name: string
}): Promise<void> {
  const pluginDir = join(input.root, input.name)
  await Bun.$`mkdir -p ${pluginDir}`
  await writeFile(
    join(pluginDir, "index.ts"),
    `
      import { plugin } from ${JSON.stringify(platformPluginImport())}

      export default plugin({
        namespace: ${JSON.stringify(input.namespace ?? "@local")},
        name: ${JSON.stringify(input.name)},
        title: ${JSON.stringify(input.name)},
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
    `,
  )
}

describe("createFirstPartyPluginState", () => {
  it("returns one cached state for repeated equivalent runtime inputs", () => {
    const first = createFirstPartyPluginState({
      env: { KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID },
    })
    const second = createFirstPartyPluginState({
      env: { KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID },
    })

    expect(second).toBe(first)
    expect(first.registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(
      true,
    )
  })

  it("keeps runtime mode fail-closed when no policy has been supplied", () => {
    const state = createFirstPartyPluginState({ env: {} })

    expect(state.registry.enabledPluginIds.size).toBe(0)
  })

  it("uses explicit interactive mode instead of scattered env-absence checks", () => {
    const state = createFirstPartyPluginState({ env: {}, mode: "interactive" })

    expect(state.registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(
      true,
    )
    expect(state.registry.enabledPlugins.length).toBe(
      state.installedPlugins.length,
    )
  })

  it("keeps explicit plugin policy authoritative in interactive mode", () => {
    const state = createFirstPartyPluginState({
      env: { KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID },
      mode: "interactive",
    })

    expect(state.registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(
      true,
    )
    expect(state.registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(
      false,
    )
  })

  it("discovers and enables harmless local-root plugins through the same registry path", async () => {
    const root = await tempRoot()
    await writeLocalPlugin({ root, name: "toy" })

    const state = await createFirstPartyPluginStateWithLocalRoots({
      env: { KORRI_ENABLED_PLUGINS: "@local:toy" },
      localRoots: [root],
    })

    expect(state.diagnostics).toEqual([])
    expect(state.installedPlugins.map(plugin => plugin.id)).toContain(
      "@local:toy",
    )
    expect(state.registry.enabledPluginIds.has("@local:toy")).toBe(true)
    expect(state.registry.handlers.map(handler => handler.id)).toContain(
      "toy.diagnostics",
    )
  })

  it("reports local plugins that claim the reserved @korri namespace", async () => {
    const root = await tempRoot()
    await writeLocalPlugin({ root, namespace: "@korri", name: "shadow" })

    const state = await createFirstPartyPluginStateWithLocalRoots({
      env: { KORRI_ENABLED_PLUGINS: "@korri:shadow" },
      localRoots: [root],
    })

    expect(state.installedPlugins.map(plugin => plugin.id)).not.toContain(
      "@korri:shadow",
    )
    expect(state.diagnostics).toEqual([
      expect.objectContaining({
        code: "reserved-namespace",
        pluginId: "@korri:shadow",
      }),
    ])
  })
})
