import type { ForegroundSessionStatusSnapshot } from "./foreground-session-status"

export type ForegroundSessionGateSnapshotInput =
  | ForegroundSessionStatusSnapshot
  | { readonly _tag: "LoadError"; readonly message: string }

export type ForegroundSessionGateState =
  | { readonly _tag: "Ready" }
  | {
      readonly _tag: "Preparing"
      readonly state: "Preparing" | "Spawning" | "Foregrounding"
      readonly requestId?: string
      readonly gameId?: string
    }
  | {
      readonly _tag: "Running"
      readonly requestId?: string
      readonly gameId?: string
    }
  | {
      readonly _tag: "Cooling"
      readonly state: "ExitObserved" | "TearingDown" | "VerifyingReady"
      readonly requestId?: string
      readonly gameId?: string
    }
  | {
      readonly _tag: "Recovering"
      readonly state: "Failed" | "Recovering"
      readonly requestId?: string
      readonly gameId?: string
      readonly stage?: string
      readonly message?: string
    }
  | { readonly _tag: "Unknown"; readonly state?: string }
  | { readonly _tag: "LoadError"; readonly message: string }

export function foregroundSessionGateStateFromSnapshot(
  input: ForegroundSessionGateSnapshotInput,
): ForegroundSessionGateState {
  if (isLoadError(input)) return input

  const snapshot = input
  switch (snapshot.state) {
    case "IdleReady":
      return { _tag: "Ready" }
    case "Preparing":
    case "Spawning":
    case "Foregrounding":
      return {
        _tag: "Preparing",
        state: snapshot.state,
        ...identity(snapshot),
      }
    case "Running":
      return {
        _tag: "Running",
        ...identity(snapshot),
      }
    case "ExitObserved":
    case "TearingDown":
    case "VerifyingReady":
      return {
        _tag: "Cooling",
        state: snapshot.state,
        ...identity(snapshot),
      }
    case "Failed":
    case "Recovering":
      return {
        _tag: "Recovering",
        state: snapshot.state,
        ...failureIdentity(snapshot),
      }
    default:
      return { _tag: "Unknown", state: snapshot.state }
  }
}

function isLoadError(
  input: ForegroundSessionGateSnapshotInput,
): input is { readonly _tag: "LoadError"; readonly message: string } {
  return "_tag" in input && input._tag === "LoadError"
}

function identity(snapshot: ForegroundSessionStatusSnapshot): {
  readonly requestId?: string
  readonly gameId?: string
} {
  return {
    ...(snapshot.active?.requestId
      ? { requestId: snapshot.active.requestId }
      : {}),
    ...(snapshot.active?.gameId ? { gameId: snapshot.active.gameId } : {}),
  }
}

function failureIdentity(snapshot: ForegroundSessionStatusSnapshot): {
  readonly requestId?: string
  readonly gameId?: string
  readonly stage?: string
  readonly message?: string
} {
  const active = identity(snapshot)
  const failure = snapshot.lastFailure
  const requestId = active.requestId ?? failure?.requestId
  const gameId = active.gameId ?? failure?.gameId
  return {
    ...(requestId ? { requestId } : {}),
    ...(gameId ? { gameId } : {}),
    ...(failure?.stage ? { stage: failure.stage } : {}),
    ...(failure?.message ? { message: failure.message } : {}),
  }
}
