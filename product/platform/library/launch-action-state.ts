import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import type { LaunchState } from "./launch-state"

export type LaunchActionBlockedReason =
  | "preparing"
  | "running"
  | "cooling"
  | "recovering"

export type LaunchActionState =
  | { readonly _tag: "Allowed" }
  | { readonly _tag: "AllowedWithUnknownStatus"; readonly message: string }
  | { readonly _tag: "Launching"; readonly gameId: string }
  | {
      readonly _tag: "Blocked"
      readonly reason: LaunchActionBlockedReason
      readonly requestId?: string
      readonly gameId?: string
      readonly message?: string
    }

export function launchActionStateFrom(input: {
  readonly launch: LaunchState
  readonly foreground: ForegroundSessionGateState
}): LaunchActionState {
  if (input.launch._tag === "Launching") {
    return { _tag: "Launching", gameId: input.launch.gameId }
  }

  switch (input.foreground._tag) {
    case "Ready":
    case "Unknown":
      return { _tag: "Allowed" }
    case "LoadError":
      return {
        _tag: "AllowedWithUnknownStatus",
        message: input.foreground.message,
      }
    case "Preparing":
      return blocked("preparing", input.foreground)
    case "Running":
      return blocked("running", input.foreground)
    case "Cooling":
      return blocked("cooling", input.foreground)
    case "Recovering":
      return blocked("recovering", input.foreground)
  }
}

function blocked(
  reason: LaunchActionBlockedReason,
  input: {
    readonly requestId?: string
    readonly gameId?: string
    readonly message?: string
  },
): LaunchActionState {
  return {
    _tag: "Blocked",
    reason,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.gameId ? { gameId: input.gameId } : {}),
    ...(input.message ? { message: input.message } : {}),
  }
}

export function launchActionStateAllowsStart(
  state: LaunchActionState,
): boolean {
  return state._tag === "Allowed" || state._tag === "AllowedWithUnknownStatus"
}
