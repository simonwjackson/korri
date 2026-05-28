import type { EntrySource } from "@shared/api/rpc/entry-source"
import type { GameRecord } from "@shared/fixtures/games/game"
import type { LaunchFailureKind, LaunchResult } from "@shared/library/launcher"
import { Cause, Exit, Option } from "effect"

/**
 * Renderer launch input. `start` accepts a `GameRecord` plus the
 * optional federation `source` tag (present on `LibraryEntry` shapes
 * coming through `app.library.list`). The tag is threaded down to
 * bridge-shaped launchers so local-source vs remote-source routing
 * fires on the desktop bun. Bare-id call sites stay valid because
 * `source` is optional.
 */
export type LaunchStartInput = GameRecord & {
  readonly source?: EntrySource
}

export type LaunchState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Launching"; readonly gameId: string }
  | { readonly _tag: "Launched"; readonly gameId: string }
  | {
      readonly _tag: "Failed"
      readonly gameId: string
      readonly exitCode: number
      readonly stderrTail?: string
      readonly failureKind?: LaunchFailureKind
    }
  | {
      readonly _tag: "Defect"
      readonly gameId: string
      readonly defect: unknown
    }

export const LaunchState = {
  idle: { _tag: "Idle" } satisfies LaunchState,

  launching: (gameId: string): LaunchState => ({ _tag: "Launching", gameId }),

  fromExit: (
    gameId: string,
    exit: Exit.Exit<LaunchResult, unknown>,
  ): LaunchState => {
    if (Exit.isFailure(exit)) {
      return { _tag: "Defect", gameId, defect: Cause.squash(exit.cause) }
    }

    if (exit.value.status === "failed") {
      return exit.value.stderrTail !== undefined
        ? {
            _tag: "Failed",
            gameId,
            exitCode: exit.value.exitCode,
            stderrTail: exit.value.stderrTail,
            ...(exit.value.failureKind
              ? { failureKind: exit.value.failureKind }
              : {}),
          }
        : {
            _tag: "Failed",
            gameId,
            exitCode: exit.value.exitCode,
            ...(exit.value.failureKind
              ? { failureKind: exit.value.failureKind }
              : {}),
          }
    }

    return { _tag: "Launched", gameId }
  },

  isLaunching: (state: LaunchState): boolean => state._tag === "Launching",

  select:
    <Tag extends LaunchState["_tag"]>(tag: Tag) =>
    (
      state: LaunchState,
    ): Option.Option<Extract<LaunchState, { readonly _tag: Tag }>> =>
      state._tag === tag
        ? Option.some(state as Extract<LaunchState, { readonly _tag: Tag }>)
        : Option.none(),
}

export interface LaunchController {
  readonly state: LaunchState
  readonly start: (game: LaunchStartInput) => void
  readonly retry: () => void
}
