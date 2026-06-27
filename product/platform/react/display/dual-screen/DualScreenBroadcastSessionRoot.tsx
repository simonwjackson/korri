import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  const revisionSourceIdRef = useRef<string | null>(null)
  revisionSourceIdRef.current ??= createDualScreenRevisionSourceId(role)
  const [state, setState] = useState<DualScreenState>(() => ({
    selectedGameId: initialGameId,
    lastSource: initialSource,
    revision: initialGameId ? 1 : 0,
    revisionSourceId: initialGameId ? revisionSourceIdRef.current : null,
    supersededRevisionSourceIds: [],
  }))
  const stateRef = useRef(state)
  stateRef.current = state
  const channelRef = useRef<DualScreenChannel | null>(null)

  useEffect(() => {
    let channel: DualScreenChannel
    try {
      channel = createChannel(channelName)
    } catch {
      channelRef.current = null
      return
    }
    channelRef.current = channel

    const receive = (message: MessageEvent<DualScreenEvent>) => {
      if (!isDualScreenEvent(message.data)) return
      if (message.data._tag === "SelectionRequested") {
        if (role === "primary")
          postToChannel(channel, snapshotFor(stateRef.current, role))
        return
      }
      setState(current => {
        const next = reduceDualScreenEvent(current, message.data)
        stateRef.current = next
        return next
      })
    }

    channel.addEventListener("message", receive)
    if (role === "companion") {
      postToChannel(channel, { _tag: "SelectionRequested", requester: role })
    } else {
      postToChannel(channel, snapshotFor(stateRef.current, role))
    }
    return () => {
      if (channelRef.current === channel) channelRef.current = null
      channel.removeEventListener("message", receive)
      channel.close()
    }
  }, [channelName, createChannel, role])

  const focusGame = useCallback((gameId: string, source: DualScreenRole) => {
    const event: DualScreenEvent = {
      _tag: "GameFocused",
      gameId,
      source,
      revision: stateRef.current.revision + 1,
      revisionSourceId: revisionSourceIdRef.current ?? source,
    }
    const next = reduceDualScreenEvent(stateRef.current, event)
    stateRef.current = next
    setState(next)
    if (channelRef.current) postToChannel(channelRef.current, event)
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

function createBroadcastChannel(name: string): DualScreenChannel {
  return new BroadcastChannel(name)
}

function postToChannel(
  channel: DualScreenChannel,
  event: DualScreenEvent,
): void {
  try {
    channel.postMessage(event)
  } catch {
    // BroadcastChannel is best-effort UI coordination. A closed or unavailable
    // channel must not crash the mounted surface; the next focus/snapshot can
    // repair peers that are still listening.
  }
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
    revisionSourceId: state.revisionSourceId,
    supersededRevisionSourceIds: state.supersededRevisionSourceIds,
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
      event.revision >= 0 &&
      (typeof event.revisionSourceId === "string" ||
        event.revisionSourceId === undefined)
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
      event.source === "primary" &&
      typeof event.revision === "number" &&
      Number.isInteger(event.revision) &&
      event.revision >= 0 &&
      (typeof event.revisionSourceId === "string" ||
        event.revisionSourceId === null ||
        event.revisionSourceId === undefined) &&
      (event.supersededRevisionSourceIds === undefined ||
        (Array.isArray(event.supersededRevisionSourceIds) &&
          event.supersededRevisionSourceIds.every(
            sourceId => typeof sourceId === "string",
          )))
    )
  }
  return false
}
