export type DualScreenRole = "primary" | "companion"

export type DualScreenEvent =
  | {
      readonly _tag: "GameFocused"
      readonly gameId: string
      readonly source: DualScreenRole
      readonly revision: number
      readonly revisionSourceId?: string
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
      readonly revisionSourceId?: string | null
      readonly supersededRevisionSourceIds?: readonly string[]
    }

export type DualScreenState = {
  readonly selectedGameId: string | null
  readonly lastSource: DualScreenRole | null
  readonly revision: number
  readonly revisionSourceId?: string | null
  readonly supersededRevisionSourceIds?: readonly string[]
}

let fallbackRevisionSourceId = 0

export function createDualScreenRevisionSourceId(role: DualScreenRole): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return `${role}:${randomId}`
  fallbackRevisionSourceId += 1
  return `${role}:${fallbackRevisionSourceId}`
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
        revisionSourceId:
          event.revisionSourceId === undefined
            ? legacyRevisionSourceId(event.source)
            : event.revisionSourceId,
        supersededRevisionSourceIds: state.supersededRevisionSourceIds,
      })
    case "SelectionSnapshot":
      if (event.source !== "primary") return state
      return applySelection(state, {
        selectedGameId: event.selectedGameId,
        lastSource: event.lastSource,
        revision: event.revision,
        revisionSourceId:
          event.revisionSourceId === undefined
            ? legacyRevisionSourceId(event.source)
            : event.revisionSourceId,
        supersededRevisionSourceIds:
          event.supersededRevisionSourceIds ??
          state.supersededRevisionSourceIds,
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
  const stateSuperseded = state.supersededRevisionSourceIds ?? []
  const incomingSuperseded = next.supersededRevisionSourceIds ?? []
  const mergedSuperseded = mergeUnique(stateSuperseded, incomingSuperseded)

  if (next.revisionSourceId && mergedSuperseded.includes(next.revisionSourceId))
    return { ...state, supersededRevisionSourceIds: mergedSuperseded }

  if (
    isLegacyRevisionSourceId(next.revisionSourceId) &&
    state.revisionSourceId &&
    !isLegacyRevisionSourceId(state.revisionSourceId)
  )
    return { ...state, supersededRevisionSourceIds: mergedSuperseded }

  if (next.revisionSourceId === state.revisionSourceId) {
    if (next.revision <= state.revision)
      return { ...state, supersededRevisionSourceIds: mergedSuperseded }
  } else if (state.revisionSourceId) {
    // A remounted primary starts a fresh local counter, so a lower/equal
    // revision from a new primary source is the handoff signal when a primary is
    // already authoritative. A higher revision from a different primary source
    // in that state is more likely a delayed event from the old primary or a
    // competing publisher and must not steal authority back. Non-primary or
    // no-source state may still accept a newer primary snapshot/focus.
    if (
      state.lastSource === "primary" &&
      next.lastSource === "primary" &&
      next.revision > state.revision
    )
      return { ...state, supersededRevisionSourceIds: mergedSuperseded }
  } else if (!next.revisionSourceId && next.revision <= state.revision) {
    return { ...state, supersededRevisionSourceIds: mergedSuperseded }
  }

  const supersededRevisionSourceIds =
    state.revisionSourceId &&
    next.revisionSourceId &&
    next.revisionSourceId !== state.revisionSourceId
      ? appendUnique(mergedSuperseded, state.revisionSourceId)
      : mergedSuperseded

  if (
    next.selectedGameId === state.selectedGameId &&
    next.lastSource === state.lastSource &&
    next.revisionSourceId === state.revisionSourceId
  ) {
    return { ...state, revision: next.revision, supersededRevisionSourceIds }
  }
  return { ...next, supersededRevisionSourceIds }
}

function legacyRevisionSourceId(source: DualScreenRole): string {
  return `legacy:${source}`
}

function isLegacyRevisionSourceId(
  sourceId: string | null | undefined,
): boolean {
  return typeof sourceId === "string" && sourceId.startsWith("legacy:")
}

function appendUnique(
  values: readonly string[],
  value: string,
): readonly string[] {
  return values.includes(value) ? values : [...values, value]
}

function mergeUnique(
  left: readonly string[],
  right: readonly string[],
): readonly string[] {
  let merged = left
  for (const value of right) merged = appendUnique(merged, value)
  return merged
}
