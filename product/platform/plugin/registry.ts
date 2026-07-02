import { Data } from "effect"

import type { ReleaseDiscoveryProvider } from "./discovery"
import type {
  ConfigRecord,
  ConfigRecordMap,
  ExecutablePluginResource,
  KorriPlugin,
  PluginConfigContributions,
  PluginHandler,
  PluginId,
} from "./index"
import { parsePluginRecordId, pluginRecordId } from "./index"

export class DuplicatePluginId extends Data.TaggedError("DuplicatePluginId")<{
  readonly pluginId: PluginId
}> {}

export class DuplicateDiscoveryProviderId extends Data.TaggedError(
  "DuplicateDiscoveryProviderId",
)<{
  readonly providerId: string
}> {}

export interface PluginRegistryOptions {
  readonly enabledPluginIds?: readonly PluginId[]
}

export interface PluginRegistry {
  readonly plugins: readonly KorriPlugin[]
  readonly enabledPlugins: readonly KorriPlugin[]
  readonly pluginIds: ReadonlySet<PluginId>
  readonly enabledPluginIds: ReadonlySet<PluginId>
  readonly providers: ConfigRecordMap
  readonly providerLinks: ConfigRecordMap
  readonly storage: ConfigRecordMap
  readonly systems: ConfigRecordMap
  readonly launchers: ConfigRecordMap
  readonly modules: ConfigRecordMap
  readonly runtimes: ConfigRecordMap
  readonly profiles: ConfigRecordMap
  readonly catalog: ConfigRecordMap
  readonly handlers: readonly PluginHandler[]
  readonly discoveryProviders: readonly ReleaseDiscoveryProvider[]
  readonly get: (pluginId: PluginId) => KorriPlugin | undefined
}

export interface ConfigRecordContribution {
  readonly pluginId: PluginId
  readonly localId: string
  readonly recordId: string
  readonly record: ConfigRecord
}

export interface ExecutableResourceContribution {
  readonly pluginId: PluginId
  readonly localId: string
  readonly recordId: string
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

  const enabledPluginIds = expandRequiredPluginIds(
    options.enabledPluginIds ?? [],
    byId,
  )
  const enabledPlugins = plugins.filter(candidate =>
    enabledPluginIds.has(candidate.id),
  )

  return {
    plugins,
    enabledPlugins,
    pluginIds: new Set(byId.keys()),
    enabledPluginIds,
    providers: mergeProviderMaps(enabledPlugins),
    providerLinks: mergePluginConfigMaps(enabledPlugins, "providerLinks"),
    storage: mergePluginConfigMaps(enabledPlugins, "storage"),
    systems: mergePluginConfigMaps(enabledPlugins, "systems"),
    launchers: mergePluginConfigMaps(enabledPlugins, "launchers"),
    modules: mergePluginConfigMaps(enabledPlugins, "modules"),
    runtimes: mergePluginConfigMaps(enabledPlugins, "runtimes"),
    profiles: mergePluginConfigMaps(enabledPlugins, "profiles"),
    catalog: mergePluginConfigMaps(enabledPlugins, "catalog"),
    handlers: enabledPlugins.flatMap(
      plugin => plugin.contributes.handlers ?? plugin.handlers,
    ),
    discoveryProviders: collectDiscoveryProviders(enabledPlugins),
    get: pluginId => byId.get(pluginId),
  }
}

export function configRecordContributions(
  records: ConfigRecordMap,
): readonly ConfigRecordContribution[] {
  return Object.entries(records).flatMap(([recordId, record]) => {
    const ref = parsePluginRecordId(recordId)
    if (!ref) return []
    return [
      {
        pluginId: ref.provider,
        localId: ref.id,
        recordId,
        record,
      },
    ]
  })
}

export function executableResources(
  registry: PluginRegistry,
): readonly ExecutableResourceContribution[] {
  return configRecordContributions(registry.modules).flatMap(contribution => {
    if (!isExecutablePluginResource(contribution.record)) return []
    return [
      {
        pluginId: contribution.pluginId,
        localId: contribution.localId,
        recordId: contribution.recordId,
        resource: contribution.record,
      },
    ]
  })
}

function expandRequiredPluginIds(
  requestedPluginIds: readonly PluginId[],
  byId: ReadonlyMap<PluginId, KorriPlugin>,
): ReadonlySet<PluginId> {
  const enabled = new Set<PluginId>(requestedPluginIds)
  const pending = [...requestedPluginIds]

  while (pending.length > 0) {
    const pluginId = pending.shift()
    if (pluginId === undefined) continue
    const plugin = byId.get(pluginId)
    if (plugin === undefined) continue

    for (const requirement of plugin.requires ?? []) {
      const requiredPluginId = requirement.ref?.provider
      if (
        requirement.autoEnable === false ||
        requiredPluginId === undefined ||
        enabled.has(requiredPluginId)
      ) {
        continue
      }
      enabled.add(requiredPluginId)
      pending.push(requiredPluginId)
    }
  }

  return enabled
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

function mergeProviderMaps(plugins: readonly KorriPlugin[]): ConfigRecordMap {
  return Object.assign(
    {},
    ...plugins.map(plugin => plugin.contributes.config.providers),
  )
}

function collectDiscoveryProviders(
  plugins: readonly KorriPlugin[],
): readonly ReleaseDiscoveryProvider[] {
  const providers = plugins.flatMap(plugin => plugin.contributes.discovery ?? [])
  const seen = new Set<string>()
  for (const provider of providers) {
    if (seen.has(provider.id)) {
      throw new DuplicateDiscoveryProviderId({ providerId: provider.id })
    }
    seen.add(provider.id)
  }
  return providers
}

function mergePluginConfigMaps(
  plugins: readonly KorriPlugin[],
  key: Exclude<keyof PluginConfigContributions, "providers">,
): ConfigRecordMap {
  return Object.assign(
    {},
    ...plugins.map(plugin => namespaceConfig(plugin, key)),
  )
}

function namespaceConfig(
  plugin: KorriPlugin,
  key: Exclude<keyof PluginConfigContributions, "providers">,
): ConfigRecordMap {
  const records = plugin.contributes.config[key] ?? {}
  return Object.fromEntries(
    Object.entries(records).map(([localId, record]) => [
      pluginRecordId(plugin.id, localId),
      record,
    ]),
  )
}

function isExecutablePluginResource(
  record: ConfigRecord,
): record is ConfigRecord & ExecutablePluginResource {
  const candidate = record as Partial<ExecutablePluginResource>
  const fulfill = candidate.fulfill as
    | Partial<ExecutablePluginResource["fulfill"]>
    | undefined
  return (
    candidate.kind === "executable" &&
    typeof candidate.id === "string" &&
    typeof fulfill?.provider === "string" &&
    typeof fulfill.binary === "string" &&
    ((fulfill.provider === "nix" && typeof fulfill.installable === "string") ||
      (fulfill.provider === "staged-path" && typeof fulfill.root === "string"))
  )
}
