import type { GameRecord } from "@shared/fixtures/games/game"
import { Context, type Effect, Schema } from "effect"

export type { GameRecord }

export type LaunchResult =
  | { readonly status: "launched" }
  | { readonly status: "failed"; readonly exitCode: number }

export class LibraryError extends Schema.TaggedErrorClass<LibraryError>()(
  "LibraryError",
  {
    reason: Schema.Literals(["io", "unavailable"]),
    message: Schema.optional(Schema.String),
  },
) {}

export interface LibraryService {
  readonly list: () => Effect.Effect<readonly GameRecord[], LibraryError>
  readonly launch: (id: string) => Effect.Effect<LaunchResult, never>
}

export class Library extends Context.Service<Library, LibraryService>()(
  "SpikeEffectAtomsLibrary",
) {}
