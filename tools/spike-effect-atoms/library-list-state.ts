import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type { GameRecord } from "@shared/fixtures/games/game"
import { Cause, Exit, Option } from "effect"
import type { LaunchResult, LibraryError } from "./library-service"

export type LibraryListState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly games: readonly GameRecord[] }
  | { readonly _tag: "LoadError"; readonly error: LibraryError }
  | { readonly _tag: "Defect"; readonly defect: unknown }

export const LibraryListState = {
  fromResult: (
    result: AsyncResult.AsyncResult<readonly GameRecord[], LibraryError>,
  ): LibraryListState =>
    AsyncResult.matchWithWaiting(result, {
      onWaiting: () => ({ _tag: "Loading" }),
      onError: error => ({ _tag: "LoadError", error }),
      onDefect: defect => ({ _tag: "Defect", defect }),
      onSuccess: success => ({ _tag: "Ready", games: success.value }),
    }),

  select:
    <Tag extends LibraryListState["_tag"]>(tag: Tag) =>
    (
      state: LibraryListState,
    ): Option.Option<Extract<LibraryListState, { readonly _tag: Tag }>> =>
      state._tag === tag
        ? Option.some(
            state as Extract<LibraryListState, { readonly _tag: Tag }>,
          )
        : Option.none(),
}

export type LaunchState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Launching"; readonly gameId: string }
  | { readonly _tag: "Launched"; readonly gameId: string }
  | {
      readonly _tag: "Failed"
      readonly gameId: string
      readonly exitCode: number
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
    exit: Exit.Exit<LaunchResult, never>,
  ): LaunchState => {
    if (Exit.isFailure(exit)) {
      return { _tag: "Defect", gameId, defect: Cause.squash(exit.cause) }
    }

    if (exit.value.status === "failed") {
      return {
        _tag: "Failed",
        gameId,
        exitCode: exit.value.exitCode,
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
