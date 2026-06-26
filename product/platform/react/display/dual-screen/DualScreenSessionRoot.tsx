import type { ReactNode } from "react"
import { useCallback, useMemo, useState } from "react"
import {
  type DualScreenSessionContextValue,
  DualScreenSessionCtx,
} from "./DualScreenSession.context"
import {
  type DualScreenEvent,
  type DualScreenRole,
  reduceDualScreenEvent,
} from "./dual-screen-events"

export interface DualScreenSessionRootProps {
  readonly initialGameId?: string | null
  readonly initialSource?: DualScreenRole | null
  readonly children: ReactNode
}

export function DualScreenSessionRoot({
  initialGameId = null,
  initialSource = initialGameId ? "primary" : null,
  children,
}: DualScreenSessionRootProps) {
  const [state, setState] = useState(() => ({
    selectedGameId: initialGameId,
    lastSource: initialSource,
    revision: initialGameId ? 1 : 0,
  }))

  const focusGame = useCallback(
    (gameId: string, source: DualScreenRole) => {
      setState(current => {
        const event: DualScreenEvent = {
          _tag: "GameFocused",
          gameId,
          source,
          revision: current.revision + 1,
        }
        return reduceDualScreenEvent(current, event)
      })
    },
    [],
  )

  const value = useMemo<DualScreenSessionContextValue>(
    () => ({
      ...state,
      focusGame,
    }),
    [state, focusGame],
  )

  return (
    <DualScreenSessionCtx.Provider value={value}>
      {children}
    </DualScreenSessionCtx.Provider>
  )
}
