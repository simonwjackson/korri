import { Schema } from "effect"

import { PlayableId } from "../playable-id"
import { ProviderId } from "./provider"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "provider link values must be non-empty",
    }),
  ),
)

const SafeRefValue = NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      value.length <= 2048
        ? undefined
        : {
            path: ["value"],
            issue: "provider ref values must be 2048 characters or fewer",
          },
    ),
  ),
  Schema.check(
    Schema.makeFilter(value =>
      [...value].some(character => {
        const codePoint = character.codePointAt(0) ?? 0
        return codePoint < 32 || codePoint === 127
      })
        ? {
            path: ["value"],
            issue: "provider ref values must not contain control characters",
          }
        : undefined,
    ),
  ),
)

const ProviderRefKind = Schema.Literals([
  "url",
  "provider-item-id",
  "external-id",
])

export const ProviderRef = Schema.Struct({
  kind: ProviderRefKind,
  value: SafeRefValue,
})
export type ProviderRef = Schema.Schema.Type<typeof ProviderRef>

export const ProviderLinkPayload = Schema.Struct({
  provider: ProviderId,
  playable: PlayableId,
  release: Schema.optional(NonEmptyString),
  ref: ProviderRef,
})
export type ProviderLinkPayload = Schema.Schema.Type<typeof ProviderLinkPayload>

export const ProviderLinkRecord = Schema.Struct({
  id: NonEmptyString,
  ...ProviderLinkPayload.fields,
})
export type ProviderLinkRecord = Schema.Schema.Type<typeof ProviderLinkRecord>

export const decodeProviderLinkPayload = (
  input: unknown,
): ProviderLinkPayload =>
  Schema.decodeUnknownSync(ProviderLinkPayload)(input, STRICT)

export const decodeProviderLinkRecord = (input: unknown): ProviderLinkRecord =>
  Schema.decodeUnknownSync(ProviderLinkRecord)(input, STRICT)
