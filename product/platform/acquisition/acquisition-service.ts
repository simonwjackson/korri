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
import { Context, type Effect, Layer } from "effect"
import type { AcquisitionError } from "./errors"

export interface AcquisitionService {
  readonly search: (
    request: SearchRequest,
  ) => Effect.Effect<SearchResponse, AcquisitionError>
  readonly details: (
    request: DetailsRequest,
  ) => Effect.Effect<SourceDetails, AcquisitionError>
  readonly plugins: () => Effect.Effect<PluginListResponse, AcquisitionError>
  readonly validateSources: (
    request: ValidateSourcesRequest,
  ) => Effect.Effect<ValidateSourcesResponse, AcquisitionError>
  readonly resolveDownload: (
    request: ResolveDownloadRequest,
  ) => Effect.Effect<DownloadResolution, AcquisitionError>
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
