import type {
  KorriPlugin,
  PluginHandler,
  PluginOperation,
} from "@platform/plugin"
import { runPluginHandler } from "@platform/plugin"
import type { PluginRegistry } from "@platform/plugin/registry"
import { createProviderScopedPluginServices } from "@platform/plugin/services"
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
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { AcquisitionError } from "./errors"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import type {
  AcquisitionPluginDefinition,
  ProviderValidationContext,
} from "./plugins/registry"

const CLAIMS_SEARCH_OPERATION = "claims.search" as const
const CLAIMS_DETAILS_OPERATION = "claims.details" as const
const CLAIMS_PARSE_URL_OPERATION = "claims.parse-url" as const
const PROVIDER_VALIDATE_OPERATION = "provider.validate" as const
const ARTIFACT_RESOLVE_DOWNLOAD_OPERATION = "artifact.resolve-download" as const
const ARTIFACT_ACQUIRE_OPERATION = "artifact.acquire" as const

export function acquisitionPluginDefinitionsFromPluginRegistry(
  registry: PluginRegistry,
): readonly AcquisitionPluginDefinition[] {
  return registry.enabledPlugins.flatMap(plugin => {
    const search = handlerFor(plugin, CLAIMS_SEARCH_OPERATION)
    const details = handlerFor(plugin, CLAIMS_DETAILS_OPERATION)
    const parseCandidateUrl = handlerFor(plugin, CLAIMS_PARSE_URL_OPERATION)
    const validateProvider = handlerFor(plugin, PROVIDER_VALIDATE_OPERATION)
    const resolveDownload = handlerFor(
      plugin,
      ARTIFACT_RESOLVE_DOWNLOAD_OPERATION,
    )
    const acquireArtifact = handlerFor(plugin, ARTIFACT_ACQUIRE_OPERATION)

    if (
      !search &&
      !details &&
      !parseCandidateUrl &&
      !validateProvider &&
      !resolveDownload &&
      !acquireArtifact
    ) {
      return []
    }

    const providerMetadata = acquisitionProviderMetadata(plugin)

    return [
      {
        metadata: {
          providerId: plugin.id,
          displayName: plugin.title,
          module: providerMetadata.module ?? `product/plugins/${plugin.name}`,
          builtIn: true,
          enabledByDefault: providerMetadata.enabledByDefault ?? false,
          legalRisk: providerMetadata.legalRisk ?? "medium",
          credentialRequired: providerMetadata.credentialRequired ?? false,
        },
        ...(search
          ? {
              search: (context, request) =>
                runAcquisitionPluginHandler<readonly ProviderClaim[]>({
                  plugin,
                  handler: search,
                  context,
                  operation: CLAIMS_SEARCH_OPERATION,
                  input: request,
                }),
            }
          : {}),
        ...(details
          ? {
              details: (context, request: DetailsRequest) =>
                runAcquisitionPluginHandler<ProviderClaimDetails>({
                  plugin,
                  handler: details,
                  context,
                  operation: CLAIMS_DETAILS_OPERATION,
                  input: request,
                }),
            }
          : {}),
        ...(parseCandidateUrl
          ? {
              parseCandidateUrl: (url: string) =>
                runSyncParseCandidateUrlHandler(plugin, parseCandidateUrl, url),
            }
          : {}),
        ...(validateProvider
          ? {
              validateProvider: (context: ProviderValidationContext) =>
                runAcquisitionPluginHandler<ProviderHealth>({
                  plugin,
                  handler: validateProvider,
                  context,
                  operation: PROVIDER_VALIDATE_OPERATION,
                  input: { checkedAt: context.checkedAt },
                }),
            }
          : {}),
        ...(resolveDownload
          ? {
              resolveDownload: (context, request: ResolveDownloadRequest) =>
                runAcquisitionPluginHandler<DownloadResolution>({
                  plugin,
                  handler: resolveDownload,
                  context,
                  operation: ARTIFACT_RESOLVE_DOWNLOAD_OPERATION,
                  input: request,
                }),
            }
          : {}),
        ...(acquireArtifact
          ? {
              acquireArtifact: (context, request: AcquireArtifactRequest) =>
                runAcquisitionPluginHandler<PluginAcquireOutput>({
                  plugin,
                  handler: acquireArtifact,
                  context,
                  operation: ARTIFACT_ACQUIRE_OPERATION,
                  input: request,
                }),
            }
          : {}),
      },
    ]
  })
}

function acquisitionProviderMetadata(plugin: KorriPlugin): {
  readonly module?: string
  readonly enabledByDefault?: boolean
  readonly legalRisk?: "low" | "medium" | "high"
  readonly credentialRequired?: boolean
} {
  const providerRecord = plugin.contributes.config.providers[plugin.id]
  return {
    module: stringValue(providerRecord, "module"),
    enabledByDefault: booleanValue(providerRecord, "enabledByDefault"),
    legalRisk: legalRiskValue(providerRecord, "legalRisk"),
    credentialRequired: booleanValue(providerRecord, "credentialRequired"),
  }
}

function stringValue(record: object, key: string): string | undefined {
  const value = (record as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

function booleanValue(record: object, key: string): boolean | undefined {
  const value = (record as Record<string, unknown>)[key]
  return typeof value === "boolean" ? value : undefined
}

function legalRiskValue(
  record: object,
  key: string,
): "low" | "medium" | "high" | undefined {
  const value = stringValue(record, key)
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined
}

function runSyncParseCandidateUrlHandler(
  plugin: KorriPlugin,
  handler: PluginHandler,
  url: string,
): string | null {
  try {
    const result = handler.run({
      operation: CLAIMS_PARSE_URL_OPERATION,
      provider: plugin.id,
      input: { url },
    })
    if (typeof result === "string") return result
    return result === null ? null : null
  } catch {
    return null
  }
}

function handlerFor(
  plugin: KorriPlugin,
  operation: PluginOperation,
): PluginHandler | undefined {
  return plugin.handlers.find(handler => handler.operation === operation)
}

function runAcquisitionPluginHandler<Output>(input: {
  readonly plugin: KorriPlugin
  readonly handler: PluginHandler
  readonly context: AcquisitionPluginContext
  readonly operation: PluginOperation
  readonly input: unknown
}): Effect.Effect<Output, AcquisitionError> {
  return runPluginHandler(input.handler, {
    operation: input.operation,
    provider: input.plugin.id,
    input: input.input,
    services: createProviderScopedPluginServices(
      input.context.services,
      input.plugin.id,
    ),
  }).pipe(
    Effect.map(value => value as Output),
    Effect.mapError(error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "defective-provider",
            providerId: input.plugin.id,
            message: `${input.operation} failed for ${input.plugin.id}: ${error instanceof Error ? error.message : String(error)}`,
          }),
    ),
  )
}
