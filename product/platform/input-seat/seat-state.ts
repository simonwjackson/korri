export type InputSeatState =
  | { readonly tag: "available"; readonly slot: number }
  | {
      readonly tag: "occupied-connected"
      readonly slot: number
      readonly launchId: string
      readonly sourceId: string
    }
  | {
      readonly tag: "occupied-disconnected-reserved"
      readonly slot: number
      readonly launchId: string
      readonly sourceId: string
      readonly reason?: string
    }

export interface InputSeatSourceIdentity {
  readonly launchId: string
  readonly sourceId: string
}

const sameSource = (
  state: Extract<
    InputSeatState,
    { readonly tag: "occupied-connected" | "occupied-disconnected-reserved" }
  >,
  source: InputSeatSourceIdentity,
): boolean =>
  state.launchId === source.launchId && state.sourceId === source.sourceId

export const connectInputSeat = (
  state: InputSeatState,
  source: InputSeatSourceIdentity,
): InputSeatState => {
  if (state.tag !== "available") {
    throw new Error(`seat ${state.slot} is not available`)
  }

  return {
    tag: "occupied-connected",
    slot: state.slot,
    launchId: source.launchId,
    sourceId: source.sourceId,
  }
}

export const disconnectInputSeat = (
  state: InputSeatState,
  reason?: string,
): InputSeatState => {
  if (state.tag !== "occupied-connected") {
    throw new Error(`seat ${state.slot} is not connected`)
  }

  return {
    tag: "occupied-disconnected-reserved",
    slot: state.slot,
    launchId: state.launchId,
    sourceId: state.sourceId,
    ...(reason ? { reason } : {}),
  }
}

export const reconnectInputSeat = (
  state: InputSeatState,
  source: InputSeatSourceIdentity,
): InputSeatState => {
  if (state.tag !== "occupied-disconnected-reserved") {
    throw new Error(`seat ${state.slot} is not disconnected-reserved`)
  }
  if (!sameSource(state, source)) {
    throw new Error(`seat ${state.slot} is reserved for a different source`)
  }

  return {
    tag: "occupied-connected",
    slot: state.slot,
    launchId: state.launchId,
    sourceId: state.sourceId,
  }
}

export const leaveInputSeat = (state: InputSeatState): InputSeatState => {
  if (state.tag === "available") return state
  return { tag: "available", slot: state.slot }
}
