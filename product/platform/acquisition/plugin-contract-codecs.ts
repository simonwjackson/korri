import {
  decodePluginAcquireOutput,
  type PluginAcquireOutput as PluginAcquireOutputType,
} from "@platform/protocol/acquisition/artifact-acquisition"
import {
  ProviderClaimDetails,
  type ProviderClaim as ProviderClaimType,
  SearchResponse,
} from "@platform/protocol/acquisition/claim"
import {
  DownloadResolution,
  type FinalDownloadResolution,
} from "@platform/protocol/acquisition/download-resolution"
import { PluginMetadata } from "@platform/protocol/acquisition/plugin"
import { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Schema } from "effect"
import { validateOutboundHttpUrl } from "./download-resolution/url-policy"
import { AcquisitionError } from "./errors"

type FinalDownloadResolutionOutput = Schema.Schema.Type<
  typeof FinalDownloadResolution
>

const MAX_PLUGIN_SEARCH_CLAIMS = 200

export function validatePluginMetadataOutput(value: unknown) {
  return decodePluginOutput(
    "metadata",
    Schema.decodeUnknownSync(PluginMetadata),
    value,
  )
}

export function validatePluginSearchOutput(
  value: unknown,
): ProviderClaimType[] {
  const claims = Array.from(
    decodePluginOutput("search", Schema.decodeUnknownSync(SearchResponse), {
      claims: value,
    }).claims,
  )
  if (claims.length > MAX_PLUGIN_SEARCH_CLAIMS) {
    throw defectiveOutput(
      "search",
      `plugin returned ${claims.length} claims; limit is ${MAX_PLUGIN_SEARCH_CLAIMS}`,
    )
  }
  return claims
}

export function validatePluginDetailsOutput(value: unknown) {
  return decodePluginOutput(
    "details",
    Schema.decodeUnknownSync(ProviderClaimDetails),
    value,
  )
}

export function validatePluginProviderHealthOutput(value: unknown) {
  return decodePluginOutput(
    "validateProvider",
    Schema.decodeUnknownSync(ProviderHealth),
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
    reason: "defective-provider",
    message: `Acquisition plugin returned invalid ${operation} output: ${error instanceof Error ? error.message : String(error)}`,
  })
}
