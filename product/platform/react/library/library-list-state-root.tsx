import {
  type LibraryListState,
  LibraryListState as LibraryListStateModel,
} from "@platform/library/library-list-state"
import type { Option } from "effect"
import { createContext, type ReactNode, useContext } from "react"

const LibraryListStateContext = createContext<LibraryListState | null>(null)

export function LibraryListStateRoot({
  result,
  children,
}: {
  readonly result: Parameters<typeof LibraryListStateModel.fromResult>[0]
  readonly children: ReactNode
}) {
  const state = LibraryListStateModel.fromResult(result)

  return (
    <LibraryListStateContext.Provider value={state}>
      {children}
    </LibraryListStateContext.Provider>
  )
}

export function useLibraryListState(): LibraryListState {
  const state = useContext(LibraryListStateContext)
  if (!state) {
    throw new Error(
      "Library list state components must be used inside LibraryListStateRoot",
    )
  }
  return state
}

export function useLibraryListCase<Tag extends LibraryListState["_tag"]>(
  tag: Tag,
): Option.Option<Extract<LibraryListState, { readonly _tag: Tag }>> {
  return LibraryListStateModel.select(tag)(useLibraryListState())
}
