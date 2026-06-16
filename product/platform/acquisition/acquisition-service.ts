import type {
  AcquireArtifactRequest,
  AcquiredArtifact,
} from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  DetailsRequest,
  ProviderClaimDetails,
  SearchRequest,
  SearchResponse,
} from "@platform/protocol/acquisition/claim"
import type {
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import type { PluginListResponse } from "@platform/protocol/acquisition/plugin"
import type {
  ValidateProvidersRequest,
  ValidateProvidersResponse,
} from "@platform/protocol/acquisition/source-health"
import { Context, Effect, Layer } from "effect"
import {
  acquireArtifact,
  acquisitionArtifactStagingRoot,
} from "./artifact-acquisition"
import {
  makeInMemoryProviderClaimStoreLayer,
  ProviderClaimStore,
} from "./claims/claim-store"
import { resolveAcquisitionDownload } from "./download-resolution/download-resolution"
import { AcquisitionError } from "./errors"
import {
  type AcquisitionRuntimeOptions,
  createAcquisitionPluginContext,
} from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"
import { getProviderDetails, getProviderDetailsByUrl } from "./source-details"
import { searchProviders } from "./source-search"
import { validateAcquisitionProviders } from "./validation/source-validation"

export interface AcquisitionService {
  readonly search: (
    request: SearchRequest,
  ) => Effect.Effect<SearchResponse, AcquisitionError>
  readonly details: (
    request: DetailsRequest,
  ) => Effect.Effect<ProviderClaimDetails, AcquisitionError>
  readonly detailsByUrl: (
    url: string,
  ) => Effect.Effect<ProviderClaimDetails, AcquisitionError>
  readonly providers: () => Effect.Effect<PluginListResponse, AcquisitionError>
  readonly validateProviders: (
    request: ValidateProvidersRequest,
  ) => Effect.Effect<ValidateProvidersResponse, AcquisitionError>
  readonly resolveDownload: (
    request: ResolveDownloadRequest,
  ) => Effect.Effect<DownloadResolution, AcquisitionError>
  readonly acquireArtifact: (
    request: AcquireArtifactRequest,
  ) => Effect.Effect<AcquiredArtifact, AcquisitionError>
}

export class Acquisition extends Context.Service<
  Acquisition,
  AcquisitionService
>()("Acquisition") {}

export function makeInMemoryAcquisitionLayer(
  service: AcquisitionService,
): Layer.Layer<Acquisition> {
  return Layer.succeed(Acquisition, service)
}

export interface LiveAcquisitionLayerOptions extends AcquisitionRuntimeOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly artifactStagingRoot?: string
}

export function makeLiveAcquisitionLayer({
  registry,
  artifactStagingRoot,
  ...runtimeOptions
}: LiveAcquisitionLayerOptions): Layer.Layer<Acquisition> {
  const context = createAcquisitionPluginContext(runtimeOptions)
  const resolveArtifactStagingRoot = () =>
    Effect.try({
      try: () =>
        artifactStagingRoot ??
        acquisitionArtifactStagingRoot(runtimeOptions.env ?? process.env),
      catch: error =>
        new AcquisitionError({
          reason: "configuration",
          message: `failed to resolve acquisition artifact staging root: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  return Layer.effect(
    Acquisition,
    Effect.gen(function* () {
      const claimStore = yield* ProviderClaimStore
      return {
        search: request =>
          searchProviders({ registry, context, request }).pipe(
            Effect.tap(response => claimStore.putMany(response.claims)),
          ),
        details: request =>
          getProviderDetails({ registry, context, request }).pipe(
            Effect.tap(details =>
              claimStore.putMany([
                {
                  _tag: "ProviderClaim",
                  providerId: details.providerId,
                  id: details.id,
                  ref: details.ref,
                  title: details.title,
                  url: details.url,
                  ...(details.downloadPageUrl
                    ? { thumbnailUrl: details.downloadPageUrl }
                    : {}),
                  ...(details.artifact ? { artifact: details.artifact } : {}),
                  ...(details.playable ? { playable: details.playable } : {}),
                  ...(details.fetchedAt
                    ? { fetchedAt: details.fetchedAt }
                    : {}),
                },
              ]),
            ),
          ),
        detailsByUrl: url =>
          getProviderDetailsByUrl({ registry, context, url }),
        providers: () =>
          Effect.succeed({
            providers: registry.providers.map(plugin => plugin.metadata),
          }),
        validateProviders: request =>
          validateAcquisitionProviders({ registry, context, request }),
        resolveDownload: request =>
          resolveAcquisitionDownload({ registry, context, request }),
        acquireArtifact: request =>
          resolveArtifactStagingRoot().pipe(
            Effect.flatMap(stagingRoot =>
              acquireArtifact({ registry, context, request, stagingRoot }),
            ),
          ),
      }
    }),
  ).pipe(Layer.provide(makeInMemoryProviderClaimStoreLayer()))
}
