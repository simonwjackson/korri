/**
 * Tagged-union errors produced by the config cascade resolver and
 * launch-spec composer. Each error carries enough context for both the
 * RPC response surface (typed error union in
 * `prepare.rpc.ts`) and human-facing log/diagnostic output.
 *
 * The split:
 * - Resolution errors (`*-NotFound`, `LauncherUnresolvable`,
 *   `CoreNotConfigured`) come from the cascade resolver — produced
 *   before any placeholder substitution.
 * - Composition errors (`MissingRequiredValue`, `UnresolvedPlaceholder`,
 *   `DisallowedCommand`) come from `composeLaunchSpec` — the final
 *   adapter that fills `{contentPath}` / `{core}` / `{system}` /
 *   `{emulator}` into the launcher's argv template.
 */

import { Data } from "effect"

export class GameNotFound extends Data.TaggedError("GameNotFound")<{
  readonly gameId: string
}> {}

export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}

export class PresetNotFound extends Data.TaggedError("PresetNotFound")<{
  readonly presetId: string
  readonly gameId: string
}> {}

export class LauncherUnresolvable extends Data.TaggedError(
  "LauncherUnresolvable",
)<{
  readonly gameId: string
}> {}

export class CoreNotConfigured extends Data.TaggedError("CoreNotConfigured")<{
  readonly gameId: string
  readonly systemId: string
  readonly launcherId: string
}> {}

export class MissingRequiredValue extends Data.TaggedError(
  "MissingRequiredValue",
)<{
  readonly field: string
}> {}

export class UnresolvedPlaceholder extends Data.TaggedError(
  "UnresolvedPlaceholder",
)<{
  readonly placeholder: string
}> {}

export class DisallowedCommand extends Data.TaggedError("DisallowedCommand")<{
  readonly command: string
}> {}

export type ResolutionError =
  | GameNotFound
  | UserNotFound
  | PresetNotFound
  | LauncherUnresolvable
  | CoreNotConfigured

export type CompositionError =
  | MissingRequiredValue
  | UnresolvedPlaceholder
  | DisallowedCommand

export type CascadeError = ResolutionError | CompositionError
