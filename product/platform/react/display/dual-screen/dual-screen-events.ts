export type DualScreenRole = "primary" | "companion"

export type DualScreenEvent = {
  readonly _tag: "GameFocused"
  readonly gameId: string
  readonly source: DualScreenRole
}

export type DualScreenState = {
  readonly selectedGameId: string
  readonly lastSource: DualScreenRole
}

export function selectedGameIdFromEvent(
  state: DualScreenState,
  event: DualScreenEvent,
): DualScreenState {
  if (
    event.gameId === state.selectedGameId &&
    event.source === state.lastSource
  ) {
    return state
  }

  return {
    selectedGameId: event.gameId,
    lastSource: event.source,
  }
}
