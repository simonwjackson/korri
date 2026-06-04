import type { ReactNode } from "react"
import { useCallback, useMemo, useState } from "react"
import {
  type DualScreenSessionContextValue,
  DualScreenSessionCtx,
} from "./DualScreenSession.context"
import {
  type DualScreenEvent,
  type DualScreenRole,
  selectedGameIdFromEvent,
} from "./dual-screen-events"

export interface DualScreenSessionRootProps {
  readonly initialGameId: string
  readonly initialSource?: DualScreenRole
  readonly children: ReactNode
}

export function DualScreenSessionRoot({
  initialGameId,
  initialSource = "primary",
  children,
}: DualScreenSessionRootProps) {
  const [state, setState] = useState(() => ({
    selectedGameId: initialGameId,
    lastSource: initialSource,
  }))

  const publish = useCallback((event: DualScreenEvent) => {
    setState(current => selectedGameIdFromEvent(current, event))
  }, [])

  const focusGame = useCallback(
    (gameId: string, source: DualScreenRole) => {
      publish({ _tag: "GameFocused", gameId, source })
    },
    [publish],
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
