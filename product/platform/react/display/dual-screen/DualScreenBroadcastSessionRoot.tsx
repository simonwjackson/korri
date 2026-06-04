import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  type DualScreenSessionContextValue,
  DualScreenSessionCtx,
} from "./DualScreenSession.context"
import {
  type DualScreenEvent,
  type DualScreenRole,
  selectedGameIdFromEvent,
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
  readonly initialGameId: string
  readonly initialSource?: DualScreenRole
  readonly channelName?: string
  readonly createChannel?: DualScreenChannelFactory
  readonly children: ReactNode
}

const DEFAULT_CHANNEL_NAME = "korri-dual-screen-session"

export function DualScreenBroadcastSessionRoot({
  initialGameId,
  initialSource = "primary",
  channelName = DEFAULT_CHANNEL_NAME,
  createChannel = createBroadcastChannel,
  children,
}: DualScreenBroadcastSessionRootProps) {
  const [state, setState] = useState(() => ({
    selectedGameId: initialGameId,
    lastSource: initialSource,
  }))
  const channel = useMemo(
    () => createChannel(channelName),
    [channelName, createChannel],
  )

  useEffect(() => {
    const receive = (message: MessageEvent<DualScreenEvent>) => {
      if (!isDualScreenEvent(message.data)) return
      setState(current => selectedGameIdFromEvent(current, message.data))
    }

    channel.addEventListener("message", receive)
    return () => {
      channel.removeEventListener("message", receive)
      channel.close()
    }
  }, [channel])

  const focusGame = useCallback(
    (gameId: string, source: DualScreenRole) => {
      const event: DualScreenEvent = { _tag: "GameFocused", gameId, source }
      setState(current => selectedGameIdFromEvent(current, event))
      channel.postMessage(event)
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

function isDualScreenEvent(value: unknown): value is DualScreenEvent {
  if (typeof value !== "object" || value === null) return false
  const event = value as Partial<DualScreenEvent>
  return (
    event._tag === "GameFocused" &&
    typeof event.gameId === "string" &&
    (event.source === "primary" || event.source === "companion")
  )
}
