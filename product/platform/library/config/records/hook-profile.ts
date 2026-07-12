/**
 * Named hook profile — a reusable `{ before?, after? }` bundle declared in
 * the readable YAML's top-level `hooks:` section (an object-keyed map, key =
 * profile id) and referenced from any cascade layer via `hooks.use: [ids]`.
 *
 * Payload-only per the ProseQL key-derived-id convention: the profile id is
 * the YAML key and never repeated in the body. Bodies deliberately cannot
 * carry `use` (strict decode rejects it), keeping the reference graph one
 * level deep so cycles are impossible by construction.
 */

import { Schema } from "effect"

import { HookAfterStep, HookBeforeStep } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

export const HookProfilePayload = Schema.Struct({
  before: Schema.optional(Schema.Array(HookBeforeStep)),
  after: Schema.optional(Schema.Array(HookAfterStep)),
})
export type HookProfilePayload = Schema.Schema.Type<typeof HookProfilePayload>

export const HookProfileRecord = Schema.Struct({
  id: Schema.String,
  ...HookProfilePayload.fields,
})
export type HookProfileRecord = Schema.Schema.Type<typeof HookProfileRecord>

export const decodeHookProfilePayload = (input: unknown): HookProfilePayload =>
  Schema.decodeUnknownSync(HookProfilePayload)(input, STRICT)

export const decodeHookProfileRecord = (input: unknown): HookProfileRecord =>
  Schema.decodeUnknownSync(HookProfileRecord)(input, STRICT)
