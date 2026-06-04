import type {
  DetailsRequest,
  SourceCandidate,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import type {
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import type { PluginMetadata } from "@platform/protocol/acquisition/plugin"
import type { SourceHealth } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { AcquisitionError } from "../errors"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import { validateKnownSourceName } from "../source-names"

export interface SourceValidationContext extends AcquisitionPluginContext {
  readonly checkedAt: string
}

export interface AcquisitionPluginDefinition {
  readonly metadata: PluginMetadata
  readonly search?: (
    context: AcquisitionPluginContext,
    request: { readonly query: string; readonly platforms?: readonly string[] },
  ) => Effect.Effect<readonly SourceCandidate[], AcquisitionError>
  readonly parseCandidateUrl?: (url: string) => string | null
  readonly details?: (
    context: AcquisitionPluginContext,
    request: DetailsRequest,
  ) => Effect.Effect<SourceDetails, AcquisitionError>
  readonly validateSource?: (
    context: SourceValidationContext,
  ) => Effect.Effect<SourceHealth, AcquisitionError>
  readonly resolveDownload?: (
    context: AcquisitionPluginContext,
    request: ResolveDownloadRequest,
  ) => Effect.Effect<DownloadResolution, AcquisitionError>
}

export interface AcquisitionPluginRegistry {
  readonly plugins: readonly AcquisitionPluginDefinition[]
  readonly sourceNames: ReadonlySet<string>
  readonly get: (sourceName: string) => AcquisitionPluginDefinition
}

export function selectAcquisitionPlugins(
  registry: AcquisitionPluginRegistry,
  sourceNames?: readonly string[],
): Effect.Effect<
  readonly AcquisitionPluginRegistry["plugins"][number][],
  AcquisitionError
> {
  return Effect.try({
    try: () => {
      if (!sourceNames || sourceNames.length === 0) return registry.plugins
      return sourceNames.map(sourceName => registry.get(sourceName))
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "caller",
            message: error instanceof Error ? error.message : String(error),
          }),
  })
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
