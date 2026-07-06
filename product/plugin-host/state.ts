import type { KorriPlugin, PluginId } from "@platform/plugin"
import type { PluginDiagnostic } from "@platform/plugin/diagnostics"
import {
  discoverPluginRoots,
  type PluginDiscoveryRoot,
} from "@platform/plugin/discovery-loader"
import type { PluginPolicy } from "@platform/plugin/policy"
import type { PluginRegistry } from "@platform/plugin/registry"
import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { readPluginHostConfig } from "./config"
import { discoverBundledPlugins } from "./roots"

export type FirstPartyPluginStateMode = "runtime" | "interactive"

export interface FirstPartyPluginStateOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly mode?: FirstPartyPluginStateMode
  readonly pluginPolicy?: PluginPolicy
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
  const hostConfig = readPluginHostConfig(env)
  const effectivePolicy = effectivePluginPolicy({
    explicit: options.pluginPolicy,
    configured: hostConfig.pluginPolicy,
  })
  const cacheKey = `${mode}\0${env.KORRI_ENABLED_PLUGINS ?? ""}\0${hostConfig.path ?? ""}\0${JSON.stringify(effectivePolicy ?? {})}`
  const cached = stateCache.get(cacheKey)
  if (cached) return cached

  const discovered = discoverBundledPlugins()
  const registry = createRegistryForState({
    plugins: discovered.plugins,
    mode,
    enabledPlugins: env.KORRI_ENABLED_PLUGINS,
    pluginPolicy: effectivePolicy,
  })
  const state: FirstPartyPluginState = {
    mode,
    installedPlugins: discovered.plugins,
    diagnostics: [...discovered.diagnostics, ...hostConfig.diagnostics],
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
  const hostConfig = readPluginHostConfig(env)
  const bundled = discoverBundledPlugins()
  const local = await discoverPluginRoots(
    localDiscoveryRoots([
      ...hostConfig.localRoots,
      ...(options.localRoots ?? []),
    ]),
  )
  const installedPlugins = [...bundled.plugins, ...local.plugins]
  return {
    mode,
    installedPlugins,
    diagnostics: [
      ...bundled.diagnostics,
      ...hostConfig.diagnostics,
      ...local.diagnostics,
    ],
    registry: createRegistryForState({
      plugins: installedPlugins,
      mode,
      enabledPlugins: env.KORRI_ENABLED_PLUGINS,
      pluginPolicy: effectivePluginPolicy({
        explicit: options.pluginPolicy,
        configured: hostConfig.pluginPolicy,
      }),
    }),
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

function createRegistryForState(input: {
  readonly plugins: readonly KorriPlugin[]
  readonly mode: FirstPartyPluginStateMode
  readonly enabledPlugins: string | undefined
  readonly pluginPolicy?: PluginPolicy
}): PluginRegistry {
  if (input.pluginPolicy) {
    return createPluginRegistry(input.plugins, {
      pluginPolicy: input.pluginPolicy,
    })
  }
  return createPluginRegistry(input.plugins, {
    enabledPluginIds: enabledPluginIdsForMode(input),
  })
}

function effectivePluginPolicy(input: {
  readonly explicit?: PluginPolicy
  readonly configured: PluginPolicy
}): PluginPolicy | undefined {
  if (input.explicit && Object.keys(input.explicit).length > 0) {
    return input.explicit
  }
  if (Object.keys(input.configured).length > 0) return input.configured
  return undefined
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
