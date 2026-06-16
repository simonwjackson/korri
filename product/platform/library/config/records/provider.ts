import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

const ProviderIdPattern = /^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/

export const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      ProviderIdPattern.test(value)
        ? undefined
        : {
            path: [],
            issue: "provider ids must be plugin-owned ids like '@korri:steam'",
          },
    ),
  ),
)
export type ProviderId = Schema.Schema.Type<typeof ProviderId>

const ProviderPayloadFields = {
  title: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.Unknown),
}

export const ProviderPayload = Schema.Struct(ProviderPayloadFields).pipe(
  Schema.check(
    Schema.makeFilter(provider =>
      provider.kind === undefined
        ? undefined
        : {
            path: ["kind"],
            issue: "providers no longer carry kind classifications",
          },
    ),
  ),
)
export type ProviderPayload = Schema.Schema.Type<typeof ProviderPayload>

export const ProviderRecord = Schema.Struct({
  id: ProviderId,
  ...ProviderPayloadFields,
}).pipe(
  Schema.check(
    Schema.makeFilter(provider =>
      provider.kind === undefined
        ? undefined
        : {
            path: ["kind"],
            issue: "providers no longer carry kind classifications",
          },
    ),
  ),
)
export type ProviderRecord = Schema.Schema.Type<typeof ProviderRecord>

export const decodeProviderPayload = (input: unknown): ProviderPayload =>
  Schema.decodeUnknownSync(ProviderPayload)(input, STRICT)

export const decodeProviderRecord = (input: unknown): ProviderRecord =>
  Schema.decodeUnknownSync(ProviderRecord)(input, STRICT)
