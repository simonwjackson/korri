/**
 * Ephemeral override — the most-specific cascade layer, supplied at
 * `prepare.rpc` time as an optional field on the payload.
 *
 * Shape mirrors `PresetPayload` minus the namespace fields (`name`,
 * `description`) and minus nested presets. The strict-mode decode
 * rejects identity-field bypass attempts (`system`, `contentPath`),
 * keeping the cascade's identity invariant intact even for runtime
 * one-off launches.
 *
 * Use case: the renderer wants to launch this game "right now with
 * extra args" without persisting a preset. The override flows from
 * RPC → cascade resolver → launch intent → runner without ever
 * touching ProseQL.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "./inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

export const EphemeralOverride = Schema.Struct({
  launcher: Schema.optional(Schema.String),
  inherit: Schema.optional(Schema.Boolean),
  byLauncher: Schema.optional(ByLauncherPayload),

  // Inlined inheritable whitelist.
  gamescope: InheritableLayer.fields.gamescope,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
})
export type EphemeralOverride = Schema.Schema.Type<typeof EphemeralOverride>

export const decodeEphemeralOverride = (input: unknown): EphemeralOverride =>
  Schema.decodeUnknownSync(EphemeralOverride)(input, STRICT)
