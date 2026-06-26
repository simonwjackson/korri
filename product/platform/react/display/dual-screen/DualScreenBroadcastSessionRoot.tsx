import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type DualScreenSessionContextValue,
  DualScreenSessionCtx,
} from "./DualScreenSession.context"
import {
  type DualScreenEvent,
  type DualScreenRole,
  type DualScreenState,
  reduceDualScreenEvent,
} from "./dual-screen-events"

export interface DualScreenChannel {
  readonly postMessage: (event: DualScreenEvent) => void
  readonly close: () => void
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<DualScreenEvent>) => void,
  ) => void
  readonly removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<DualScreenEvent>) => void,
  ) => void
}

export type DualScreenChannelFactory = (name: string) => DualScreenChannel

export interface DualScreenBroadcastSessionRootProps {
  readonly initialGameId?: string | null
  readonly initialSource?: DualScreenRole | null
  readonly role?: DualScreenRole
  readonly channelName?: string
  readonly createChannel?: DualScreenChannelFactory
  readonly children: ReactNode
}

const DEFAULT_CHANNEL_NAME = "korri-dual-screen-session"

export function DualScreenBroadcastSessionRoot({
  initialGameId = null,
  initialSource = initialGameId ? "primary" : null,
  role = "primary",
  channelName = DEFAULT_CHANNEL_NAME,
  createChannel = createBroadcastChannel,
  children,
}: DualScreenBroadcastSessionRootProps) {
  const [state, setState] = useState<DualScreenState>(() => ({
    selectedGameId: initialGameId,
    lastSource: initialSource,
    revision: initialGameId ? 1 : 0,
  }))
  const stateRef = useRef(state)
  stateRef.current = state
  const channel = useMemo(
    () => createChannel(channelName),
    [channelName, createChannel],
  )

  useEffect(() => {
    const receive = (message: MessageEvent<DualScreenEvent>) => {
      if (!isDualScreenEvent(message.data)) return
      if (message.data._tag === "SelectionRequested") {
        if (role === "primary") channel.postMessage(snapshotFor(stateRef.current, role))
        return
      }
      setState(current => reduceDualScreenEvent(current, message.data))
    }

    channel.addEventListener("message", receive)
    if (role === "companion") {
      channel.postMessage({ _tag: "SelectionRequested", requester: role })
    } else {
      channel.postMessage(snapshotFor(stateRef.current, role))
    }
    return () => {
      channel.removeEventListener("message", receive)
      channel.close()
    }
  }, [channel, role])

  const focusGame = useCallback(
    (gameId: string, source: DualScreenRole) => {
      setState(current => {
        const event: DualScreenEvent = {
          _tag: "GameFocused",
          gameId,
          source,
          revision: current.revision + 1,
        }
        const next = reduceDualScreenEvent(current, event)
        channel.postMessage(event)
        return next
      })
    },
    [channel],
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

function createBroadcastChannel(name: string): DualScreenChannel {
  return new BroadcastChannel(name)
}

function snapshotFor(
  state: DualScreenState,
  source: DualScreenRole,
): DualScreenEvent {
  return {
    _tag: "SelectionSnapshot",
    selectedGameId: state.selectedGameId,
    lastSource: state.lastSource,
    source,
    revision: state.revision,
  }
}

function isDualScreenEvent(value: unknown): value is DualScreenEvent {
  if (typeof value !== "object" || value === null) return false
  const event = value as Partial<DualScreenEvent>
  if (event._tag === "GameFocused") {
    return (
      typeof event.gameId === "string" &&
      (event.source === "primary" || event.source === "companion") &&
      typeof event.revision === "number" &&
      Number.isInteger(event.revision) &&
      event.revision >= 0
    )
  }
  if (event._tag === "SelectionRequested") {
    return event.requester === "primary" || event.requester === "companion"
  }
  if (event._tag === "SelectionSnapshot") {
    return (
      (typeof event.selectedGameId === "string" ||
        event.selectedGameId === null) &&
      (event.lastSource === "primary" ||
        event.lastSource === "companion" ||
        event.lastSource === null) &&
      (event.source === "primary" || event.source === "companion") &&
      typeof event.revision === "number" &&
      Number.isInteger(event.revision) &&
      event.revision >= 0
    )
  }
  return false
}
