import type { EntrySource } from "@shared/api/rpc/entry-source"
import type { ResolvedGameRecord } from "@shared/fixtures/games/game"
import type { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import type { GamescopePolicy } from "@shared/library/config/inheritable-fields"
import type {
  LaunchResult,
  LaunchSpec,
  ManagedLaunchResult,
} from "@shared/library/launcher"
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
  readonly list: () => Effect.Effect<
    readonly ResolvedGameRecord[],
    LibraryError
  >
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

/**
 * Additive launch options that travel alongside the spec. Federation
 * routing needs `source` to flow from the renderer (which knows which
 * peer a `GameRecord` came from via the `LibraryEntry.source` tag)
 * down to bridge-shaped launchers that can't recover it from the
 * opaque renderer-side spec (`{ command: id }`).
 *
 * Spec-shaped launchers (shell/session/memory) ignore this field; the
 * renderer's bridge-shaped launcher forwards it to the desktop bun so
 * the local-source delegate fires for `source.isLocal === true`.
 */
export interface LaunchOptions {
  readonly source?: EntrySource
}

export interface LauncherService {
  readonly run: (
    spec: LaunchSpec,
    options?: LaunchOptions,
  ) => Effect.Effect<LaunchResult, LibraryError>
  readonly spawn?: (
    spec: LaunchSpec,
    options?: LaunchOptions,
  ) => Effect.Effect<ManagedLaunchResult, LibraryError>
}

export class LibrarySource extends Context.Service<
  LibrarySource,
  LibrarySourceService
>()("LibrarySource") {}

export class Launcher extends Context.Service<Launcher, LauncherService>()(
  "Launcher",
) {}
