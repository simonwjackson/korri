import type {
  AcquireArtifactRequest,
  PluginAcquireOutput,
} from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  DetailsRequest,
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type {
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import type { PluginMetadata } from "@platform/protocol/acquisition/plugin"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { AcquisitionError } from "../errors"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import { validateKnownProviderId } from "../provider-ids"

export interface ProviderValidationContext extends AcquisitionPluginContext {
  readonly checkedAt: string
}

export interface AcquisitionPluginDefinition {
  readonly metadata: PluginMetadata
  readonly search?: (
    context: AcquisitionPluginContext,
    request: { readonly query: string; readonly platforms?: readonly string[] },
  ) => Effect.Effect<readonly ProviderClaim[], AcquisitionError>
  readonly parseCandidateUrl?: (url: string) => string | null
  readonly details?: (
    context: AcquisitionPluginContext,
    request: DetailsRequest,
  ) => Effect.Effect<ProviderClaimDetails, AcquisitionError>
  readonly validateProvider?: (
    context: ProviderValidationContext,
  ) => Effect.Effect<ProviderHealth, AcquisitionError>
  readonly resolveDownload?: (
    context: AcquisitionPluginContext,
    request: ResolveDownloadRequest,
  ) => Effect.Effect<DownloadResolution, AcquisitionError>
  readonly acquireArtifact?: (
    context: AcquisitionPluginContext,
    request: AcquireArtifactRequest,
  ) => Effect.Effect<PluginAcquireOutput, AcquisitionError>
}

export interface AcquisitionPluginRegistry {
  readonly providers: readonly AcquisitionPluginDefinition[]
  readonly providerIds: ReadonlySet<string>
  readonly get: (providerId: string) => AcquisitionPluginDefinition
}

export function selectAcquisitionPlugins(
  registry: AcquisitionPluginRegistry,
  providerIds?: readonly string[],
): Effect.Effect<
  readonly AcquisitionPluginRegistry["providers"][number][],
  AcquisitionError
> {
  return Effect.try({
    try: () => {
      if (!providerIds || providerIds.length === 0) return registry.providers
      return providerIds.map(providerId => registry.get(providerId))
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
  providers: readonly AcquisitionPluginDefinition[],
): AcquisitionPluginRegistry {
  const byId = new Map<string, AcquisitionPluginDefinition>()
  for (const plugin of providers) byId.set(plugin.metadata.providerId, plugin)
  return {
    providers,
    providerIds: new Set(byId.keys()),
    get: providerId => {
      const canonical = validateKnownProviderId(
        providerId,
        new Set(byId.keys()),
      )
      const plugin = byId.get(canonical)
      if (plugin === undefined) {
        throw new Error("validated acquisition provider missing from registry")
      }
      return plugin
    },
  }
}
