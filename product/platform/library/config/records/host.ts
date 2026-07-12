import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

export const HostPayload = Schema.Struct({
  title: Schema.optional(Schema.String),

  // Host is the least-specific local machine layer. It is intentionally a
  // plain block: no role taxonomy, launch block, or nested profile defaults.
  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  preferences: InheritableLayer.fields.preferences,
  plugin: InheritableLayer.fields.plugin,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
  hooks: InheritableLayer.fields.hooks,
})
export type HostPayload = Schema.Schema.Type<typeof HostPayload>

export const HostRecord = Schema.Struct({
  id: Schema.String,
  ...HostPayload.fields,
})
export type HostRecord = Schema.Schema.Type<typeof HostRecord>

export const decodeHostPayload = (input: unknown): HostPayload =>
  Schema.decodeUnknownSync(HostPayload)(input, STRICT)

export const decodeHostRecord = (input: unknown): HostRecord =>
  Schema.decodeUnknownSync(HostRecord)(input, STRICT)
