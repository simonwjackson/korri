import { Schema } from "effect"

import { HooksPolicy, InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

/**
 * Host-only hooks vocabulary: the shared HooksPolicy fields plus the
 * `trust-removable` opt-in. When the TRUSTED root's host sets it to `true`,
 * removable/untrusted config roots (SD-card `*.korri.yaml`) keep the inline
 * `hooks` fields on their library entries instead of having them stripped
 * at config-graph load. It is graph-load policy, not a cascade
 * contribution — the readable fold reads only before/after/use. Every
 * non-host record keeps the strict HooksPolicy shape and rejects this key
 * at decode, so a removable fragment can never carry it anywhere the graph
 * would accept.
 */
export const HostHooksPolicy = Schema.Struct({
  ...HooksPolicy.fields,
  "trust-removable": Schema.optional(Schema.Boolean),
})
export type HostHooksPolicy = Schema.Schema.Type<typeof HostHooksPolicy>

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
  hooks: Schema.optional(HostHooksPolicy),
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
