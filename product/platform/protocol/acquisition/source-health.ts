import { Schema } from "effect"

const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/),
  ),
)

export const ValidateProvidersRequest = Schema.Struct({
  providerIds: Schema.optional(Schema.Array(ProviderId)),
})
export type ValidateProvidersRequest = Schema.Schema.Type<
  typeof ValidateProvidersRequest
>

export const HealthyProvider = Schema.TaggedStruct("HealthyProvider", {
  providerId: ProviderId,
  checkedAt: Schema.String,
})

export const UnhealthyProvider = Schema.TaggedStruct("UnhealthyProvider", {
  providerId: ProviderId,
  checkedAt: Schema.String,
  reason: Schema.Literals([
    "configuration",
    "credentials",
    "network",
    "provider-error",
    "defective-provider",
  ]),
  message: Schema.String,
})

export const ProviderHealth = Schema.Union([HealthyProvider, UnhealthyProvider])
export type ProviderHealth = Schema.Schema.Type<typeof ProviderHealth>

export const ValidateProvidersResponse = Schema.Struct({
  providers: Schema.Array(ProviderHealth),
})
export type ValidateProvidersResponse = Schema.Schema.Type<
  typeof ValidateProvidersResponse
>
