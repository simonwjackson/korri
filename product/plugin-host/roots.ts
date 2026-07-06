import type { KorriPlugin } from "@platform/plugin"
import type { PluginDiagnostic } from "@platform/plugin/diagnostics"
import { pluginDiagnostic } from "@platform/plugin/diagnostics"
import { bundledPluginInventory } from "./bundled-plugins.generated"

export interface BundledPluginDiscoveryResult {
  readonly plugins: readonly KorriPlugin[]
  readonly diagnostics: readonly PluginDiagnostic[]
}

export function discoverBundledPlugins(
  inventory: readonly KorriPlugin[] = bundledPluginInventory,
): BundledPluginDiscoveryResult {
  if (inventory.length === 0) {
    return {
      plugins: [],
      diagnostics: [
        pluginDiagnostic({
          code: "missing-root",
          source: "bundled-plugin-inventory",
          message: "Bundled plugin inventory is empty",
        }),
      ],
    }
  }

  return { plugins: inventory, diagnostics: [] }
}

export const bundledFirstPartyPlugins = discoverBundledPlugins().plugins
