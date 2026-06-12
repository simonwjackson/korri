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

import { ArtifactId } from "@platform/protocol/artifact/artifact"
import { Schema } from "effect"

import {
  GamescopePolicy,
  MoonlightPolicy,
  RetroArchPolicy,
  RyubingPolicy,
  SteamPolicy,
} from "./inheritable-fields"
import { LaunchSettings } from "./launch-block"
import { AppRecord } from "./records/app"
import { RuntimeRecord } from "./records/runtime"
import { StorageRecord } from "./records/storage"

export const ResolvedLaunchContext = Schema.Struct({
  // Identity (straight from the game record).
  gameId: Schema.String,
  contentPath: Schema.optional(Schema.String),
  content: Schema.optional(
    Schema.Struct({
      artifactId: ArtifactId,
    }),
  ),
  system: Schema.String,

  // Resolved app/launcher (output of Pass 0 — skeleton pass).
  launcherId: Schema.String,
  appId: Schema.optional(Schema.String),

  // Optional placeholder values populated from the cascade/materializer.
  moduleId: Schema.optional(Schema.String),
  modulePath: Schema.optional(Schema.String),
  configPath: Schema.optional(Schema.String),
  configDir: Schema.optional(Schema.String),
  userDir: Schema.optional(Schema.String),
  core: Schema.optional(Schema.String),
  emulator: Schema.optional(Schema.String),

  // Resolved inheritable behavior fields (post-merge).
  gamescope: Schema.optional(GamescopePolicy),
  moonlight: Schema.optional(MoonlightPolicy),
  retroarch: Schema.optional(RetroArchPolicy),
  ryubing: Schema.optional(RyubingPolicy),
  steam: Schema.optional(SteamPolicy),
  settings: Schema.optional(LaunchSettings),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type ResolvedLaunchContext = Schema.Schema.Type<
  typeof ResolvedLaunchContext
>

export const ReadableResolvedLaunchContext = Schema.Struct({
  playableId: Schema.String,
  itemId: Schema.String,
  containedId: Schema.optional(Schema.String),
  releaseId: Schema.String,
  system: Schema.String,
  sourceId: Schema.String,
  target: Schema.String,
  app: AppRecord,
  runtime: Schema.optional(RuntimeRecord),
  content: Schema.optional(
    Schema.Struct({
      path: Schema.String,
    }),
  ),
  gamescope: Schema.optional(GamescopePolicy),
  moonlight: Schema.optional(MoonlightPolicy),
  retroarch: Schema.optional(RetroArchPolicy),
  ryubing: Schema.optional(RyubingPolicy),
  steam: Schema.optional(SteamPolicy),
  storage: Schema.optional(Schema.Record(Schema.String, StorageRecord)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type ReadableResolvedLaunchContext = Schema.Schema.Type<
  typeof ReadableResolvedLaunchContext
>
