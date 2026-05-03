import type { GameRecord } from "@shared/fixtures/games/game"
import type { LibraryError } from "@shared/library/library-services"
import { Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

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
