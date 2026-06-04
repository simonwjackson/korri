import type { PluginMetadata } from "@platform/protocol/acquisition/plugin"
import { validateKnownSourceName } from "../source-names"

export interface AcquisitionPluginDefinition {
  readonly metadata: PluginMetadata
}

export interface AcquisitionPluginRegistry {
  readonly plugins: readonly AcquisitionPluginDefinition[]
  readonly sourceNames: ReadonlySet<string>
  readonly get: (sourceName: string) => AcquisitionPluginDefinition
}

export function createAcquisitionPluginRegistry(
  plugins: readonly AcquisitionPluginDefinition[],
): AcquisitionPluginRegistry {
  const byName = new Map<string, AcquisitionPluginDefinition>()
  for (const plugin of plugins) byName.set(plugin.metadata.sourceName, plugin)
  return {
    plugins,
    sourceNames: new Set(byName.keys()),
    get: sourceName => {
      const canonical = validateKnownSourceName(
        sourceName,
        new Set(byName.keys()),
      )
      const plugin = byName.get(canonical)
      if (plugin === undefined) {
        throw new Error("validated acquisition source missing from registry")
      }
      return plugin
    },
  }
}
