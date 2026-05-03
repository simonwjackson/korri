import type { GameRecord } from "@shared/fixtures/games/game"
import { Context, type Effect, Schema } from "effect"

export type { GameRecord }

export type LaunchResult =
  | { readonly status: "launched" }
  | { readonly status: "failed"; readonly exitCode: number }

export class LibraryError extends Schema.TaggedError<LibraryError>()(
  "LibraryError",
  {
    reason: Schema.Literal("io", "unavailable"),
    message: Schema.optional(Schema.String),
  },
) {}

export interface LibraryService {
  readonly list: () => Effect.Effect<readonly GameRecord[], LibraryError>
  readonly launch: (id: string) => Effect.Effect<LaunchResult, never>
}

export class Library extends Context.Tag("SpikeEffectAtomsLibrary")<
  Library,
  LibraryService
>() {}
