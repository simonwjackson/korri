import type { GameRecord } from "@shared/fixtures/games/game"
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

export interface LibrarySourceService {
  readonly list: () => Effect.Effect<readonly GameRecord[], LibraryError>
  readonly launchSpecFor: (
    id: string,
  ) => Effect.Effect<LaunchSpec | undefined, LibraryError>
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
