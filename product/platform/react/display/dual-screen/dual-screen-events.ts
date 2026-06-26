export type DualScreenRole = "primary" | "companion"

export type DualScreenEvent =
  | {
      readonly _tag: "GameFocused"
      readonly gameId: string
      readonly source: DualScreenRole
      readonly revision: number
    }
  | {
      readonly _tag: "SelectionRequested"
      readonly requester: DualScreenRole
    }
  | {
      readonly _tag: "SelectionSnapshot"
      readonly selectedGameId: string | null
      readonly lastSource: DualScreenRole | null
      readonly source: DualScreenRole
      readonly revision: number
    }

export type DualScreenState = {
  readonly selectedGameId: string | null
  readonly lastSource: DualScreenRole | null
  readonly revision: number
}

export function reduceDualScreenEvent(
  state: DualScreenState,
  event: DualScreenEvent,
): DualScreenState {
  switch (event._tag) {
    case "GameFocused":
      return applySelection(state, {
        selectedGameId: event.gameId,
        lastSource: event.source,
        revision: event.revision,
      })
    case "SelectionSnapshot":
      return applySelection(state, {
        selectedGameId: event.selectedGameId,
        lastSource: event.lastSource,
        revision: event.revision,
      })
    case "SelectionRequested":
      return state
  }
}

export const selectedGameIdFromEvent = reduceDualScreenEvent

function applySelection(
  state: DualScreenState,
  next: DualScreenState,
): DualScreenState {
  if (next.revision <= state.revision) return state
  if (
    next.selectedGameId === state.selectedGameId &&
    next.lastSource === state.lastSource
  ) {
    return { ...state, revision: next.revision }
  }
  return next
}
