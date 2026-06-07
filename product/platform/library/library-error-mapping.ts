import { cascadeErrorMessage } from "@platform/library/config/errors"
import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError } from "@platform/library/library-services"
import { Effect } from "effect"

export const cascadeErrorToLibraryError = (error: unknown): LibraryError =>
  new LibraryError({
    reason: "config",
    message: cascadeErrorMessage(error),
  })

export const resolvedLaunchSpecOrUndefined = <A extends { spec: LaunchSpec }>(
  effect: Effect.Effect<A, unknown>,
): Effect.Effect<LaunchSpec | undefined, LibraryError> =>
  effect.pipe(
    Effect.matchEffect({
      onSuccess: out => Effect.succeed(out.spec as LaunchSpec | undefined),
      onFailure: error =>
        isTaggedGameNotFound(error)
          ? Effect.succeed(undefined as LaunchSpec | undefined)
          : Effect.fail(cascadeErrorToLibraryError(error)),
    }),
  )

const isTaggedGameNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  (error._tag === "GameNotFound" || error._tag === "PlayableNotFound")
