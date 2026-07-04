import type { EntrySource } from "@platform/api/rpc/entry-source"
import { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { AppIntegrationKind } from "@platform/library/config/app-integrations"
import type { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import type {
  LaunchCompanionMap,
} from "@platform/library/config/inheritable-fields"
import type { StreamerPolicy } from "@platform/library/config/streamer-policy"
import type { LaunchAlternative } from "@platform/library/launch-alternative"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type {
  LaunchExtras,
  LaunchResult,
  LaunchSpec,
  ManagedLaunchResult,
} from "@platform/library/launcher"
import type {
  PlayableLibraryEntry,
  PlayableReleaseEntry,
} from "@platform/library/playable-library"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"
import type { LaunchPrepareMap } from "@platform/plugin/launch-prepare"
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
  readonly releaseId?: string
  readonly appId?: string
  readonly userId?: string
  readonly profileId?: string
  /** @deprecated use profileId. */
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLocalLauncherPolicy {
  readonly launchCompanions: LaunchCompanionMap
  readonly moonlight?: StreamerPolicy
}

export interface ResolvedLaunch {
  readonly spec: LaunchSpec
  readonly launchCompanions?: LaunchCompanionMap
  readonly launchPrepare?: LaunchPrepareMap
  readonly launchMetadata?: LaunchMetadata
  readonly extras?: LaunchExtras
  readonly artifacts?: LaunchArtifacts
  readonly app?: {
    readonly id: string
    readonly integration: AppIntegrationKind
  }
  readonly playable?: {
    readonly id: string
    readonly itemId: string
    readonly containedId?: string
    readonly title?: string
  }
  readonly release?: PlayableReleaseEntry
}

export interface ContentSourceService {
  readonly id: string
  readonly kinds: readonly ContentItem["_tag"][]
  readonly list: () => Effect.Effect<readonly ContentItem[], LibraryError>
}

export interface LibrarySourceService {
  /** Temporary display-compat list for UI callers until task-043. */
  readonly list: () => Effect.Effect<
    readonly ResolvedGameRecord[],
    LibraryError
  >
  readonly listPlayableEntries?: () => Effect.Effect<
    readonly PlayableLibraryEntry[],
    LibraryError
  >
  readonly launchSpecFor: (
    id: string,
    releaseId?: string,
  ) => Effect.Effect<LaunchSpec | undefined, LibraryError>
  readonly canResolveLaunchForGame?: (
    id: string,
    inputs?: ResolveLaunchInputs,
  ) => Effect.Effect<boolean, LibraryError>
  readonly resolveLaunchForGame: (
    id: string,
    inputs?: ResolveLaunchInputs,
  ) => Effect.Effect<ResolvedLaunch, LibraryError>
  readonly resolveLocalLauncherPolicy?: (
    launcherId: string,
    inputs?: Pick<ResolveLaunchInputs, "override">,
  ) => Effect.Effect<ResolvedLocalLauncherPolicy, LibraryError>
}

export interface LaunchOptions {
  readonly source?: EntrySource
  readonly extras?: LaunchExtras
  readonly launchAlternatives?: readonly LaunchAlternative[]
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
