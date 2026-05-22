/**
 * Output of the cascade resolver — the fully-resolved set of fields
 * needed by `composeLaunchSpec` to produce a `LaunchSpec`, plus the
 * resolved `gamescope` policy that rides on the launch intent.
 *
 * This type is the boundary between Pass 2 (cascade fold) and Pass 3
 * (placeholder substitution). Keeping it explicit makes the split
 * legible: the resolver decides *what should be set*; the composer
 * decides *how the chosen launcher uses it*.
 *
 * Notes:
 * - `gamescope` is carried separately from `env`/`cwd`/`argsAppend`
 *   because the runner wraps it AROUND the launch spec at execution
 *   time. The launch intent file persists it next to (not inside)
 *   `LaunchSpec`.
 * - `core`, `system`, `emulator` are populated when the resolved
 *   launcher's argv template references them as placeholders, but the
 *   resolver does not enforce that here — `composeLaunchSpec` raises
 *   `MissingRequiredValue` if a referenced placeholder lacks a value.
 */

import { Schema } from "effect"

import { GamescopePolicy } from "./inheritable-fields"

export const ResolvedLaunchContext = Schema.Struct({
  // Identity (straight from the game record).
  gameId: Schema.String,
  contentPath: Schema.String,
  system: Schema.String,

  // Resolved launcher (output of Pass 0 — skeleton pass).
  launcherId: Schema.String,

  // Optional placeholder values populated from the cascade.
  core: Schema.optional(Schema.String),
  emulator: Schema.optional(Schema.String),

  // Resolved inheritable behavior fields (post-merge).
  gamescope: Schema.optional(GamescopePolicy),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
})
export type ResolvedLaunchContext = Schema.Schema.Type<
  typeof ResolvedLaunchContext
>
