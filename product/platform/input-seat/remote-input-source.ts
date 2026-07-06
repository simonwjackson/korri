import {
  connectInputSeat,
  disconnectInputSeat,
  leaveInputSeat,
  reconnectInputSeat,
  type InputSeatState,
} from "./seat-state"

export interface RemoteInputSourcePort {
  readonly connected: (
    state: InputSeatState,
    sourceId: string,
  ) => InputSeatState
  readonly disconnected: (
    state: InputSeatState,
    reason?: string,
  ) => InputSeatState
  readonly reconnected: (
    state: InputSeatState,
    sourceId: string,
  ) => InputSeatState
  readonly left: (state: InputSeatState) => InputSeatState
}

export interface MemoryRemoteInputSource extends RemoteInputSourcePort {
  readonly events: () => readonly string[]
}

export const createMemoryRemoteInputSource = (input: {
  readonly launchId: string
}): MemoryRemoteInputSource => {
  const events: string[] = []

  return {
    events: () => [...events],
    connected: (state, sourceId) => {
      const next = connectInputSeat(state, {
        launchId: input.launchId,
        sourceId,
      })
      events.push(`connected:${sourceId}`)
      return next
    },
    disconnected: (state, reason) => {
      const next = disconnectInputSeat(state, reason)
      events.push(`disconnected:${reason ?? "unknown"}`)
      return next
    },
    reconnected: (state, sourceId) => {
      const next = reconnectInputSeat(state, {
        launchId: input.launchId,
        sourceId,
      })
      events.push(`reconnected:${sourceId}`)
      return next
    },
    left: state => {
      const next = leaveInputSeat(state)
      events.push("left")
      return next
    },
  }
}
