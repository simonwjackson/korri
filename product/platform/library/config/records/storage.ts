import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "storage values must be non-empty",
    }),
  ),
)

export const StoragePayload = Schema.Struct({
  root: NonEmptyString,
  path: Schema.optional(Schema.Record(Schema.String, NonEmptyString)),
})
export type StoragePayload = Schema.Schema.Type<typeof StoragePayload>

export const StorageRecord = Schema.Struct({
  id: NonEmptyString,
  ...StoragePayload.fields,
})
export type StorageRecord = Schema.Schema.Type<typeof StorageRecord>

export const decodeStoragePayload = (input: unknown): StoragePayload =>
  Schema.decodeUnknownSync(StoragePayload)(input, STRICT)

export const decodeStorageRecord = (input: unknown): StorageRecord =>
  Schema.decodeUnknownSync(StorageRecord)(input, STRICT)
