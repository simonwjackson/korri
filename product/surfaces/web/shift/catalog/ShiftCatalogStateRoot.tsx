import type { Option } from "effect"
import { createContext, type ReactNode, useContext } from "react"
import {
  type ShiftCatalogState,
  ShiftCatalogState as ShiftCatalogStateModel,
} from "./shift-catalog-state"

const ShiftCatalogStateContext = createContext<ShiftCatalogState | null>(null)

export function ShiftCatalogStateRoot({
  result,
  children,
}: {
  readonly result: Parameters<typeof ShiftCatalogStateModel.fromResult>[0]
  readonly children: ReactNode
}) {
  const state = ShiftCatalogStateModel.fromResult(result)

  return (
    <ShiftCatalogStateContext.Provider value={state}>
      {children}
    </ShiftCatalogStateContext.Provider>
  )
}

export function useShiftCatalogState(): ShiftCatalogState {
  const state = useContext(ShiftCatalogStateContext)
  if (!state) {
    throw new Error(
      "Shift catalog state components must be used inside ShiftCatalogStateRoot",
    )
  }
  return state
}

export function useShiftCatalogCase<Tag extends ShiftCatalogState["_tag"]>(
  tag: Tag,
): Option.Option<Extract<ShiftCatalogState, { readonly _tag: Tag }>> {
  return ShiftCatalogStateModel.select(tag)(useShiftCatalogState())
}
