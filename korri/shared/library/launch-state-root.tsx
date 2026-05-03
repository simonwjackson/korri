import type { Option } from "effect"
import { createContext, type ReactNode, useContext } from "react"
import {
  type LaunchState,
  LaunchState as LaunchStateModel,
} from "./launch-state"

const LaunchStateContext = createContext<LaunchState | null>(null)

export function LaunchStateRoot({
  state,
  children,
}: {
  readonly state: LaunchState
  readonly children: ReactNode
}) {
  return (
    <LaunchStateContext.Provider value={state}>
      {children}
    </LaunchStateContext.Provider>
  )
}

export function useLaunchState(): LaunchState {
  const state = useContext(LaunchStateContext)
  if (!state) {
    throw new Error(
      "Launch state components must be used inside LaunchStateRoot",
    )
  }
  return state
}

export function useLaunchCase<Tag extends LaunchState["_tag"]>(
  tag: Tag,
): Option.Option<Extract<LaunchState, { readonly _tag: Tag }>> {
  return LaunchStateModel.select(tag)(useLaunchState())
}
