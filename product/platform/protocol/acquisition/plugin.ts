import { Schema } from "effect"
import { ProviderClaim, ProviderClaimDetails } from "./claim"
import { DownloadResolution } from "./download-resolution"
import { ProviderHealth } from "./source-health"

const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/),
  ),
)

export const PluginMetadata = Schema.Struct({
  providerId: ProviderId,
  displayName: Schema.String,
  module: Schema.String,
  builtIn: Schema.Boolean,
  enabledByDefault: Schema.Boolean,
  legalRisk: Schema.Literals(["low", "medium", "high"]),
  credentialRequired: Schema.Boolean,
})
export type PluginMetadata = Schema.Schema.Type<typeof PluginMetadata>

export const PluginListResponse = Schema.Struct({
  providers: Schema.Array(PluginMetadata),
})
export type PluginListResponse = Schema.Schema.Type<typeof PluginListResponse>

export const PluginOperationOutput = Schema.Union([
  Schema.Array(ProviderClaim),
  ProviderClaimDetails,
  ProviderHealth,
  DownloadResolution,
  PluginListResponse,
])
export type PluginOperationOutput = Schema.Schema.Type<
  typeof PluginOperationOutput
>
