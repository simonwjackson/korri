import type { KorriPlugin, PluginId } from "@platform/plugin"
import type { PluginDiagnostic } from "@platform/plugin/diagnostics"
import {
  discoverPluginRoots,
  type PluginDiscoveryRoot,
} from "@platform/plugin/discovery-loader"
import type { PluginRegistry } from "@platform/plugin/registry"
import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { discoverBundledPlugins } from "./roots"

export type FirstPartyPluginStateMode = "runtime" | "interactive"

export interface FirstPartyPluginStateOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly mode?: FirstPartyPluginStateMode
}

export interface FirstPartyPluginStateWithLocalRootsOptions
  extends FirstPartyPluginStateOptions {
  readonly localRoots?: readonly string[]
}

export interface FirstPartyPluginState {
  readonly mode: FirstPartyPluginStateMode
  readonly installedPlugins: readonly KorriPlugin[]
  readonly diagnostics: readonly PluginDiagnostic[]
  readonly registry: PluginRegistry
}

const stateCache = new Map<string, FirstPartyPluginState>()

export function createFirstPartyPluginState(
  options: FirstPartyPluginStateOptions = {},
): FirstPartyPluginState {
  const env = options.env ?? process.env
  const mode = options.mode ?? "runtime"
  const cacheKey = `${mode}\0${env.KORRI_ENABLED_PLUGINS ?? ""}`
  const cached = stateCache.get(cacheKey)
  if (cached) return cached

  const discovered = discoverBundledPlugins()
  const enabledPluginIds = enabledPluginIdsForMode({
    mode,
    enabledPlugins: env.KORRI_ENABLED_PLUGINS,
    plugins: discovered.plugins,
  })
  const registry = createPluginRegistry(discovered.plugins, {
    enabledPluginIds,
  })
  const state: FirstPartyPluginState = {
    mode,
    installedPlugins: discovered.plugins,
    diagnostics: discovered.diagnostics,
    registry,
  }
  stateCache.set(cacheKey, state)
  return state
}

export async function createFirstPartyPluginStateWithLocalRoots(
  options: FirstPartyPluginStateWithLocalRootsOptions = {},
): Promise<FirstPartyPluginState> {
  const env = options.env ?? process.env
  const mode = options.mode ?? "runtime"
  const bundled = discoverBundledPlugins()
  const local = await discoverPluginRoots(
    localDiscoveryRoots(options.localRoots),
  )
  const installedPlugins = [...bundled.plugins, ...local.plugins]
  const enabledPluginIds = enabledPluginIdsForMode({
    mode,
    enabledPlugins: env.KORRI_ENABLED_PLUGINS,
    plugins: installedPlugins,
  })
  return {
    mode,
    installedPlugins,
    diagnostics: [...bundled.diagnostics, ...local.diagnostics],
    registry: createPluginRegistry(installedPlugins, { enabledPluginIds }),
  }
}

export function resetFirstPartyPluginStateForTests(): void {
  stateCache.clear()
}

function localDiscoveryRoots(
  roots: readonly string[] | undefined,
): readonly PluginDiscoveryRoot[] {
  return (roots ?? []).map(path => ({ path, source: "local", devMode: true }))
}

function enabledPluginIdsForMode(input: {
  readonly mode: FirstPartyPluginStateMode
  readonly enabledPlugins: string | undefined
  readonly plugins: readonly KorriPlugin[]
}): readonly PluginId[] {
  const configured = input.enabledPlugins?.trim()
  if (configured) return [...new Set(parseEnabledPluginIds(configured))]
  if (input.mode === "interactive")
    return input.plugins.map(plugin => plugin.id)
  return []
}
