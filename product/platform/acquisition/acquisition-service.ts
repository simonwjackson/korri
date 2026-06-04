import type {
  AcquireArtifactRequest,
  AcquiredArtifact,
} from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  DetailsRequest,
  SearchRequest,
  SearchResponse,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import type {
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import type { PluginListResponse } from "@platform/protocol/acquisition/plugin"
import type {
  ValidateSourcesRequest,
  ValidateSourcesResponse,
} from "@platform/protocol/acquisition/source-health"
import { Context, Effect, Layer } from "effect"
import {
  acquireArtifact,
  acquisitionArtifactStagingRoot,
} from "./artifact-acquisition"
import { resolveAcquisitionDownload } from "./download-resolution/download-resolution"
import { AcquisitionError } from "./errors"
import {
  type AcquisitionRuntimeOptions,
  createAcquisitionPluginContext,
} from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"
import { getSourceDetails, getSourceDetailsByUrl } from "./source-details"
import { searchSources } from "./source-search"
import { validateAcquisitionSources } from "./validation/source-validation"

export interface AcquisitionService {
  readonly search: (
    request: SearchRequest,
  ) => Effect.Effect<SearchResponse, AcquisitionError>
  readonly details: (
    request: DetailsRequest,
  ) => Effect.Effect<SourceDetails, AcquisitionError>
  readonly detailsByUrl: (
    url: string,
  ) => Effect.Effect<SourceDetails, AcquisitionError>
  readonly plugins: () => Effect.Effect<PluginListResponse, AcquisitionError>
  readonly validateSources: (
    request: ValidateSourcesRequest,
  ) => Effect.Effect<ValidateSourcesResponse, AcquisitionError>
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
  return makeInMemoryAcquisitionLayer({
    search: request => searchSources({ registry, context, request }),
    details: request => getSourceDetails({ registry, context, request }),
    detailsByUrl: url => getSourceDetailsByUrl({ registry, context, url }),
    plugins: () =>
      Effect.succeed({
        plugins: registry.plugins.map(plugin => plugin.metadata),
      }),
    validateSources: request =>
      validateAcquisitionSources({ registry, context, request }),
    resolveDownload: request =>
      resolveAcquisitionDownload({ registry, context, request }),
    acquireArtifact: request =>
      resolveArtifactStagingRoot().pipe(
        Effect.flatMap(stagingRoot =>
          acquireArtifact({ registry, context, request, stagingRoot }),
        ),
      ),
  })
}
