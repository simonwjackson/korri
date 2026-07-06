import type { PluginDiagnostic } from "./diagnostics"
import { pluginDiagnostic } from "./diagnostics"
import type { KorriPlugin, PluginId } from "./index"

export interface PluginPolicyEntry {
  readonly enabled?: boolean
  readonly capabilities?: readonly string[]
  readonly source?: "policy" | "env-compat"
}

export type PluginPolicy = Readonly<Record<PluginId, PluginPolicyEntry>>

export interface PluginPolicyResolution {
  readonly enabledPluginIds: readonly PluginId[]
  readonly diagnostics: readonly PluginDiagnostic[]
}

export function enabledPluginIdsFromPolicy(
  plugins: readonly KorriPlugin[],
  policy: PluginPolicy,
): PluginPolicyResolution {
  const byId = new Map(plugins.map(plugin => [plugin.id, plugin] as const))
  const enabledPluginIds: PluginId[] = []
  const diagnostics: PluginDiagnostic[] = []

  for (const [pluginId, entry] of Object.entries(policy) as readonly [
    PluginId,
    PluginPolicyEntry,
  ][]) {
    const plugin = byId.get(pluginId)
    if (!plugin) {
      diagnostics.push(
        pluginDiagnostic({
          code: "missing-plugin",
          pluginId,
          message: `Plugin policy references undiscovered plugin ${pluginId}`,
        }),
      )
      continue
    }

    for (const capability of entry.capabilities ?? []) {
      if (!declaresCapability(plugin, capability)) {
        diagnostics.push(
          pluginDiagnostic({
            code: "denied-capability",
            pluginId,
            capability,
            message: `Plugin ${pluginId} does not declare capability ${capability}`,
          }),
        )
      }
    }

    if (entry.enabled === true) enabledPluginIds.push(pluginId)
  }

  return { enabledPluginIds, diagnostics }
}

export function pluginPolicyFromEnabledPluginEnv(
  value: string | undefined,
  options: { readonly mode: "test-dev" | "runtime" },
): PluginPolicy {
  if (options.mode !== "test-dev") return {}
  return Object.fromEntries(
    parsePluginIds(value).map(pluginId => [
      pluginId,
      { enabled: true, source: "env-compat" } satisfies PluginPolicyEntry,
    ]),
  ) as PluginPolicy
}

function declaresCapability(plugin: KorriPlugin, capability: string): boolean {
  if (
    plugin.requires?.some(requirement => requirement.capability === capability)
  ) {
    return true
  }
  return plugin.handlers.some(
    handler =>
      handler.operation === capability ||
      handler.capabilities?.includes(capability) === true,
  )
}

function parsePluginIds(value: string | undefined): readonly PluginId[] {
  if (value === undefined) return []
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map(item => item.trim())
        .filter(
          (item): item is PluginId =>
            item.startsWith("@") && item.includes(":"),
        ),
    ),
  ]
}
