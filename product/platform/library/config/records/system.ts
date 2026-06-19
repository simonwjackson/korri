/**
 * System record — metadata/identity for a compatibility domain (snes, psx,
 * switch). Host/device substrate remains "platform"; systems intentionally do
 * not select launchers, runtimes, cores, or inheritable launch policy.
 */

import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

export const SystemPayload = Schema.Struct({
  // Display metadata (optional; populated by importers/plugins).
  name: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  manufacturer: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
export type SystemPayload = Schema.Schema.Type<typeof SystemPayload>

export const SystemRecord = Schema.Struct({
  id: Schema.String,
  ...SystemPayload.fields,
})
export type SystemRecord = Schema.Schema.Type<typeof SystemRecord>

export const decodeSystemPayload = (input: unknown): SystemPayload =>
  Schema.decodeUnknownSync(SystemPayload)(input, STRICT)

export const decodeSystemRecord = (input: unknown): SystemRecord =>
  Schema.decodeUnknownSync(SystemRecord)(input, STRICT)
