import { Schema } from "effect"
import { SourceCandidate, SourceDetails } from "./candidate"
import { DownloadResolution } from "./download-resolution"
import { SourceHealth } from "./source-health"

export const PluginMetadata = Schema.Struct({
  sourceName: Schema.String,
  displayName: Schema.String,
  module: Schema.String,
  builtIn: Schema.Boolean,
  enabledByDefault: Schema.Boolean,
  legalRisk: Schema.Literals(["low", "medium", "high"]),
  credentialRequired: Schema.Boolean,
})
export type PluginMetadata = Schema.Schema.Type<typeof PluginMetadata>

export const PluginListResponse = Schema.Struct({
  plugins: Schema.Array(PluginMetadata),
})
export type PluginListResponse = Schema.Schema.Type<typeof PluginListResponse>

export const PluginOperationOutput = Schema.Union([
  Schema.Array(SourceCandidate),
  SourceDetails,
  SourceHealth,
  DownloadResolution,
  PluginListResponse,
])
export type PluginOperationOutput = Schema.Schema.Type<
  typeof PluginOperationOutput
>
