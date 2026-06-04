import {
  decodePluginAcquireOutput,
  type PluginAcquireOutput as PluginAcquireOutputType,
} from "@platform/protocol/acquisition/artifact-acquisition"
import {
  SearchResponse,
  type SourceCandidate,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import {
  DownloadResolution,
  type FinalDownloadResolution,
} from "@platform/protocol/acquisition/download-resolution"
import { PluginMetadata } from "@platform/protocol/acquisition/plugin"
import { SourceHealth } from "@platform/protocol/acquisition/source-health"
import { Schema } from "effect"
import { validateOutboundHttpUrl } from "./download-resolution/url-policy"
import { AcquisitionError } from "./errors"

type FinalDownloadResolutionOutput = Schema.Schema.Type<
  typeof FinalDownloadResolution
>

const MAX_PLUGIN_SEARCH_CANDIDATES = 200

export function validatePluginMetadataOutput(value: unknown) {
  return decodePluginOutput(
    "metadata",
    Schema.decodeUnknownSync(PluginMetadata),
    value,
  )
}

export function validatePluginSearchOutput(value: unknown): SourceCandidate[] {
  const candidates = Array.from(
    decodePluginOutput("search", Schema.decodeUnknownSync(SearchResponse), {
      candidates: value,
    }).candidates,
  )
  if (candidates.length > MAX_PLUGIN_SEARCH_CANDIDATES) {
    throw defectiveOutput(
      "search",
      `plugin returned ${candidates.length} candidates; limit is ${MAX_PLUGIN_SEARCH_CANDIDATES}`,
    )
  }
  return candidates
}

export function validatePluginDetailsOutput(value: unknown) {
  return decodePluginOutput(
    "details",
    Schema.decodeUnknownSync(SourceDetails),
    value,
  )
}

export function validatePluginSourceHealthOutput(value: unknown) {
  return decodePluginOutput(
    "validateSource",
    Schema.decodeUnknownSync(SourceHealth),
    value,
  )
}

export function validatePluginAcquireOutput(
  value: unknown,
): PluginAcquireOutputType {
  return decodePluginOutput("acquireArtifact", decodePluginAcquireOutput, value)
}

export function validatePluginDownloadResolutionOutput(value: unknown) {
  const resolution = decodePluginOutput(
    "resolveDownload",
    Schema.decodeUnknownSync(DownloadResolution),
    value,
  )
  if (resolution._tag === "FinalDownload") validateFinalDownloadUrl(resolution)
  return resolution
}

function validateFinalDownloadUrl(
  resolution: FinalDownloadResolutionOutput,
): void {
  try {
    validateOutboundHttpUrl(resolution.url)
  } catch (error) {
    if (error instanceof AcquisitionError) throw error
    throw defectiveOutput("resolveDownload", error)
  }
}

function decodePluginOutput<A>(
  operation: string,
  decode: (value: unknown) => A,
  value: unknown,
): A {
  try {
    return decode(value)
  } catch (error) {
    throw defectiveOutput(operation, error)
  }
}

function defectiveOutput(operation: string, error: unknown): AcquisitionError {
  return new AcquisitionError({
    reason: "defective-source",
    message: `Acquisition plugin returned invalid ${operation} output: ${error instanceof Error ? error.message : String(error)}`,
  })
}
