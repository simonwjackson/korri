import { Schema } from "effect"

export const ValidateSourcesRequest = Schema.Struct({
  sourceNames: Schema.optional(Schema.Array(Schema.String)),
})
export type ValidateSourcesRequest = Schema.Schema.Type<
  typeof ValidateSourcesRequest
>

export const HealthySource = Schema.TaggedStruct("HealthySource", {
  sourceName: Schema.String,
  checkedAt: Schema.String,
})

export const UnhealthySource = Schema.TaggedStruct("UnhealthySource", {
  sourceName: Schema.String,
  checkedAt: Schema.String,
  reason: Schema.Literals([
    "configuration",
    "credentials",
    "network",
    "source-error",
    "defective-source",
  ]),
  message: Schema.String,
})

export const SourceHealth = Schema.Union([HealthySource, UnhealthySource])
export type SourceHealth = Schema.Schema.Type<typeof SourceHealth>

export const ValidateSourcesResponse = Schema.Struct({
  sources: Schema.Array(SourceHealth),
})
export type ValidateSourcesResponse = Schema.Schema.Type<
  typeof ValidateSourcesResponse
>
