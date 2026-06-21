import { Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

export type PicoDataState<A, E = unknown> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly value: A }
  | { readonly _tag: "LoadError"; readonly error: E }
  | { readonly _tag: "Defect"; readonly defect: unknown }

export const PicoDataState = {
  fromResult: <A, E>(
    result: AsyncResult.AsyncResult<A, E>,
  ): PicoDataState<A, E> =>
    AsyncResult.matchWithError(result, {
      onInitial: () => ({ _tag: "Loading" }),
      onError: error => ({ _tag: "LoadError", error }),
      onDefect: defect => ({ _tag: "Defect", defect }),
      onSuccess: success => ({ _tag: "Ready", value: success.value }),
    }),

  select:
    <A, E, Tag extends PicoDataState<A, E>["_tag"]>(tag: Tag) =>
    (
      state: PicoDataState<A, E>,
    ): Option.Option<Extract<PicoDataState<A, E>, { readonly _tag: Tag }>> =>
      state._tag === tag
        ? Option.some(
            state as Extract<PicoDataState<A, E>, { readonly _tag: Tag }>,
          )
        : Option.none(),
}
