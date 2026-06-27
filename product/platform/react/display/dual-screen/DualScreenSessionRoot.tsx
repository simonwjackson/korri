import type { ReactNode } from "react"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  type DualScreenSessionContextValue,
  DualScreenSessionCtx,
} from "./DualScreenSession.context"
import {
  createDualScreenRevisionSourceId,
  type DualScreenEvent,
  type DualScreenRole,
  type DualScreenState,
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
  const revisionSourceIdRef = useRef<string | null>(null)
  revisionSourceIdRef.current ??= createDualScreenRevisionSourceId(
    initialSource ?? "primary",
  )
  const [state, setState] = useState<DualScreenState>(() => ({
    selectedGameId: initialGameId,
    lastSource: initialSource,
    revision: initialGameId ? 1 : 0,
    revisionSourceId: initialGameId ? revisionSourceIdRef.current : null,
    supersededRevisionSourceIds: [],
  }))

  const focusGame = useCallback((gameId: string, source: DualScreenRole) => {
    setState(current => {
      const event: DualScreenEvent = {
        _tag: "GameFocused",
        gameId,
        source,
        revision: current.revision + 1,
        revisionSourceId: revisionSourceIdRef.current ?? source,
      }
      return reduceDualScreenEvent(current, event)
    })
  }, [])

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
