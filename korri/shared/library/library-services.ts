import type { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import type { GamescopePolicy } from "@shared/library/config/inheritable-fields"
import type { GameRecord } from "@shared/library/config/records/game"
import type { LaunchResult, LaunchSpec } from "@shared/library/launcher"
import { Context, type Effect, Schema } from "effect"

export class LibraryError extends Schema.TaggedErrorClass<LibraryError>()(
  "LibraryError",
  {
    reason: Schema.Literals(["io", "unavailable", "config"]),
    message: Schema.optional(Schema.String),
    diagnostic: Schema.optional(Schema.String),
  },
) {}

export interface ResolveLaunchInputs {
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLaunch {
  readonly spec: LaunchSpec
  readonly gamescope?: GamescopePolicy
}

export interface LibrarySourceService {
  readonly list: () => Effect.Effect<readonly GameRecord[], LibraryError>
  /**
   * Back-compat wrapper around `resolveLaunchForGame` — returns just the
   * LaunchSpec (drops gamescope) and produces `undefined` on resolution
   * failure rather than a typed error. Used by the legacy
   * `library/launch.rpc-handler` call shape.
   */
  readonly launchSpecFor: (
    id: string,
  ) => Effect.Effect<LaunchSpec | undefined, LibraryError>
  /**
   * Full resolved-launch output — drives the new `stream/prepare.rpc`
   * handler. Surfaces `LibraryError` for proseql/IO failures; the
   * cascade resolver's typed errors are folded into LibraryError at
   * this seam.
   */
  readonly resolveLaunchForGame: (
    id: string,
    inputs?: ResolveLaunchInputs,
  ) => Effect.Effect<ResolvedLaunch, LibraryError>
}

export interface LauncherService {
  readonly run: (spec: LaunchSpec) => Effect.Effect<LaunchResult, LibraryError>
}

export class LibrarySource extends Context.Service<
  LibrarySource,
  LibrarySourceService
>()("LibrarySource") {}

export class Launcher extends Context.Service<Launcher, LauncherService>()(
  "Launcher",
) {}
