/**
 * User record — per-person config layer.
 *
 * v1 ships with an empty users collection; nothing is seeded. Omitted
 * `userId` at the RPC boundary means "no user layer contribution"
 * (cascade folds without a user layer). Named-but-missing userId
 * surfaces as `UserNotFound`.
 *
 * Layer-bearing: a user can carry inheritable behavior fields (e.g.,
 * `gamescope.enable = true`) and presets that are always visible
 * when the user is selected at launch time.
 *
 * Identity fields stay on `GamePayload`.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { LaunchBlock } from "../launch-block"
import { PlayableId } from "../playable-id"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

export const UserPayload = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  favorites: Schema.optional(Schema.Array(PlayableId)),
  hidden: Schema.optional(Schema.Array(PlayableId)),

  // Public launch block; launch.app wins over legacy launcher.
  launch: Schema.optional(LaunchBlock),

  // Per-user default launcher (legacy alias for launch.app).
  launcher: Schema.optional(Schema.String),

  // Layer-bearing fields.
  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),
  byLauncher: Schema.optional(ByLauncherPayload),

  // Inlined inheritable whitelist.
  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type UserPayload = Schema.Schema.Type<typeof UserPayload>

export const UserRecord = Schema.Struct({
  id: Schema.String,
  ...UserPayload.fields,
})
export type UserRecord = Schema.Schema.Type<typeof UserRecord>

export const decodeUserPayload = (input: unknown): UserPayload =>
  Schema.decodeUnknownSync(UserPayload)(input, STRICT)

export const decodeUserRecord = (input: unknown): UserRecord =>
  Schema.decodeUnknownSync(UserRecord)(input, STRICT)
