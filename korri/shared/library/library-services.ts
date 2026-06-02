import type { EntrySource } from "@shared/api/rpc/entry-source"
import { ResolvedGameRecord } from "@shared/fixtures/games/game"
import type { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import type { GamescopePolicy } from "@shared/library/config/inheritable-fields"
import type {
  LaunchExtras,
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

const GameContentItem = Schema.TaggedStruct("GameItem", {
  game: ResolvedGameRecord,
})

const MediaContentItem = Schema.TaggedStruct("MediaItem", {
  id: Schema.String,
  sourceId: Schema.String,
  title: Schema.String,
})

const TrackContentItem = Schema.TaggedStruct("TrackItem", {
  id: Schema.String,
  sourceId: Schema.String,
  title: Schema.String,
})

export const ContentItem = Schema.Union([
  GameContentItem,
  MediaContentItem,
  TrackContentItem,
])
export type ContentItem = Schema.Schema.Type<typeof ContentItem>

export interface ResolveLaunchInputs {
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLaunch {
  readonly spec: LaunchSpec
  readonly gamescope?: GamescopePolicy
  /**
   * task-014: Launcher-anchor / session-lifecycle hints. Set when the
   * resolved launcher is a launcher-anchor app (Steam, browser,
   * desktop session manager) whose primary process exits while the
   * user-visible session continues. Sessiond consumes this via
   * `LauncherService.spawn(spec, { extras })`; spec-shaped launchers
   * (shell/memory) ignore it.
   *
   * Default (undefined) means foreground semantics — the launcher
   * IS the session, terminal child-exit is the lifecycle end.
   *
   * See `korri/shared/library/sessiond-managed-launch-protocol.ts`
   * for the rule that `extras.lifecycle === "session"` requires the
   * daemon's `sessionLifecycle` capability; `session-launcher.ts`
   * degrades to a typed `host-unavailable` failure when the
   * capability is absent rather than silently routing through
   * foreground semantics.
   */
  readonly extras?: LaunchExtras
}

export interface ContentSourceService {
  readonly id: string
  readonly kinds: readonly ContentItem["_tag"][]
  readonly list: () => Effect.Effect<readonly ContentItem[], LibraryError>
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
 * Spec-shaped launchers (shell/session/memory) ignore `source`; the
 * renderer's bridge-shaped launcher forwards it to the desktop bun so
 * the local-source delegate fires for `source.isLocal === true`.
 *
 * `extras` carries session-lifecycle hints (`lifecycle`, `wait`) that
 * sessiond-backed launchers forward via the managed-launch protocol
 * (task-014). The shell launcher ignores it; the sessiond launcher
 * checks the `sessionLifecycle` capability before honoring
 * `lifecycle: "session"` (degrades to a typed `host-unavailable`
 * failure rather than silently downgrading to foreground).
 */
export interface LaunchOptions {
  readonly source?: EntrySource
  readonly extras?: LaunchExtras
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

export class ContentSources extends Context.Service<
  ContentSources,
  readonly ContentSourceService[]
>()("ContentSources") {}

export class LibrarySource extends Context.Service<
  LibrarySource,
  LibrarySourceService
>()("LibrarySource") {}

export class Launcher extends Context.Service<Launcher, LauncherService>()(
  "Launcher",
) {}
