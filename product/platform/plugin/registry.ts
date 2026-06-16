import { Data } from "effect"

import type {
  ExecutablePluginResource,
  KorriPlugin,
  PluginCatalogItem,
  PluginId,
  PluginResource,
} from "./index"

export class DuplicatePluginId extends Data.TaggedError("DuplicatePluginId")<{
  readonly pluginId: PluginId
}> {}

export interface PluginRegistryOptions {
  readonly enabledPluginIds?: readonly PluginId[]
}

export interface PluginRegistry {
  readonly plugins: readonly KorriPlugin[]
  readonly enabledPlugins: readonly KorriPlugin[]
  readonly pluginIds: ReadonlySet<PluginId>
  readonly enabledPluginIds: ReadonlySet<PluginId>
  readonly catalog: readonly PluginCatalogContribution[]
  readonly resources: readonly PluginResourceContribution[]
  readonly get: (pluginId: PluginId) => KorriPlugin | undefined
}

export interface PluginCatalogContribution {
  readonly pluginId: PluginId
  readonly item: PluginCatalogItem
}

export interface PluginResourceContribution {
  readonly pluginId: PluginId
  readonly resource: PluginResource
}

export interface ExecutableResourceContribution {
  readonly pluginId: PluginId
  readonly resource: ExecutablePluginResource
}

export function createPluginRegistry(
  plugins: readonly KorriPlugin[],
  options: PluginRegistryOptions = {},
): PluginRegistry {
  const byId = new Map<PluginId, KorriPlugin>()
  for (const candidate of plugins) {
    if (byId.has(candidate.id)) {
      throw new DuplicatePluginId({ pluginId: candidate.id })
    }
    byId.set(candidate.id, candidate)
  }

  const enabledPluginIds = new Set<PluginId>(options.enabledPluginIds ?? [])
  const enabledPlugins = plugins.filter(candidate =>
    enabledPluginIds.has(candidate.id),
  )

  return {
    plugins,
    enabledPlugins,
    pluginIds: new Set(byId.keys()),
    enabledPluginIds,
    catalog: enabledPlugins.flatMap(plugin =>
      (plugin.contributes.catalog ?? []).map(item => ({
        pluginId: plugin.id,
        item,
      })),
    ),
    resources: enabledPlugins.flatMap(plugin =>
      (plugin.contributes.resources ?? []).map(resource => ({
        pluginId: plugin.id,
        resource,
      })),
    ),
    get: pluginId => byId.get(pluginId),
  }
}

export function executableResources(
  registry: PluginRegistry,
): readonly ExecutableResourceContribution[] {
  return registry.resources.filter(
    (entry): entry is ExecutableResourceContribution =>
      entry.resource.kind === "executable",
  )
}

export function parseEnabledPluginIds(
  value: string | undefined,
): readonly PluginId[] {
  if (value === undefined) return []
  return value
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(
      (item): item is PluginId => item.startsWith("@") && item.includes(":"),
    )
}
