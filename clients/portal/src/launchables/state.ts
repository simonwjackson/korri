import type {
  LaunchAppResult,
  Launchable,
  QueryLaunchablesResult,
} from "@contracts/bridge/korri-native-bridge"
import type { Direction } from "../input/types"

/**
 * Launchables screen state. Raw bridge results are converted into this ADT
 * at the seam; components never inspect bridge payloads directly.
 */
export type LaunchablesState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "LoadError"; readonly message: string }
  | {
      readonly _tag: "Ready"
      readonly items: readonly Launchable[]
      readonly selectedIndex: number
      readonly notice: string | null
    }

/** Minimal local Maybe until Effect's Option arrives with the RPC slice. */
export type Maybe<A> =
  | { readonly _tag: "Some"; readonly value: A }
  | { readonly _tag: "None" }

export const LaunchablesState = {
  loading: (): LaunchablesState => ({ _tag: "Loading" }),

  fromQueryResult: (result: QueryLaunchablesResult): LaunchablesState =>
    result._tag === "Launchables"
      ? { _tag: "Ready", items: result.items, selectedIndex: 0, notice: null }
      : { _tag: "LoadError", message: result.message },

  moveSelection: (
    state: LaunchablesState,
    direction: Direction,
  ): LaunchablesState => {
    if (state._tag !== "Ready" || state.items.length === 0) return state
    const delta = direction === "down" ? 1 : direction === "up" ? -1 : 0
    if (delta === 0) return state
    const last = state.items.length - 1
    const next = Math.min(last, Math.max(0, state.selectedIndex + delta))
    return next === state.selectedIndex
      ? state
      : { ...state, selectedIndex: next, notice: null }
  },

  selected: (state: LaunchablesState): Maybe<Launchable> => {
    if (state._tag !== "Ready") return { _tag: "None" }
    const item = state.items[state.selectedIndex]
    return item === undefined ? { _tag: "None" } : { _tag: "Some", value: item }
  },

  withLaunchResult: (
    state: LaunchablesState,
    result: LaunchAppResult,
  ): LaunchablesState => {
    if (state._tag !== "Ready") return state
    return result._tag === "Launched"
      ? { ...state, notice: null }
      : { ...state, notice: `${result.reason}: ${result.message}` }
  },
}
