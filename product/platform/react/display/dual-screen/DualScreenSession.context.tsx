import { createContext, useContext } from "react"
import type { DualScreenRole, DualScreenState } from "./dual-screen-events"

export type DualScreenSessionContextValue = DualScreenState & {
  readonly focusGame: (gameId: string, source: DualScreenRole) => void
}

export const DualScreenSessionCtx =
  createContext<DualScreenSessionContextValue | null>(null)

export function useDualScreenSession(): DualScreenSessionContextValue {
  const context = useContext(DualScreenSessionCtx)
  if (!context) {
    throw new Error(
      "useDualScreenSession must be used inside a DualScreenSessionRoot",
    )
  }
  return context
}
