// Runtime-settings recovery policy (Layer 3, U-B — Korri-side half).
//
// This is the pure decision core of the frozen/black-screen recovery: given the
// stream of commands we sent and the terminal outcomes that came back, decide
// whether to revert to the last known-good value and always surface the event.
//
// It is deliberately a pure reducer with no I/O. The live half — subscribing to
// the control socket, learning the native requestId from a command.accepted
// response, and issuing the revert via the Moonlight control client — is wired
// in the session supervisor during the device session, because the native
// decode-stall signal (a resolution the host applied but the client could not
// decode, surfaced as a `failed` outcome) must be tuned on hardware. This
// reducer is intentionally NOT an external poller of screen state; it only
// consumes command outcomes that already flow over local-control.

import type {
  MoonlightControlCommandMethod,
  MoonlightControlRequestId,
  MoonlightControlRuntimeSettingsStatus,
} from "./moonlight-control-protocol"

/** Mutation commands carry a value we may need to restore. IDR does not. */
export type RuntimeMutationCommand =
  | "runtime.setBitrate"
  | "runtime.setFps"
  | "runtime.setResolution"

/** The value a mutation applied: a scalar (bitrate/FPS) or a resolution. */
export type RuntimeSettingValue =
  | { readonly kind: "scalar"; readonly value: number }
  | {
      readonly kind: "resolution"
      readonly width: number
      readonly height: number
    }

interface PendingCommand {
  readonly command: RuntimeMutationCommand
  readonly value: RuntimeSettingValue
  /** True when this command is itself a recovery revert, so we never loop. */
  readonly isRevert: boolean
}

export interface RuntimeRecoveryState {
  /** Last decode-confirmed applied value per mutation command. */
  readonly knownGood: Readonly<
    Partial<Record<RuntimeMutationCommand, RuntimeSettingValue>>
  >
  /** In-flight commands keyed by native requestId, awaiting a terminal result. */
  readonly pending: Readonly<Record<string, PendingCommand>>
}

export const initialRuntimeRecoveryState: RuntimeRecoveryState = {
  knownGood: {},
  pending: {},
}

/** A command we dispatched (after its command.accepted returned a requestId). */
export interface RuntimeRecoverySentInput {
  readonly kind: "sent"
  readonly requestId: MoonlightControlRequestId
  readonly command: MoonlightControlCommandMethod
  readonly value: RuntimeSettingValue
  /** Set when replaying a revert so a failed revert does not re-revert. */
  readonly isRevert?: boolean
}

/** A terminal runtime.commandResult outcome for a previously-sent command. */
export interface RuntimeRecoveryResultInput {
  readonly kind: "result"
  readonly requestId: MoonlightControlRequestId
  readonly command: MoonlightControlCommandMethod
  readonly status: MoonlightControlRuntimeSettingsStatus
}

export type RuntimeRecoveryInput =
  | RuntimeRecoverySentInput
  | RuntimeRecoveryResultInput

/** Restore the last known-good value for a command that stalled. */
export interface RuntimeRecoveryRevertAction {
  readonly kind: "revert"
  readonly command: RuntimeMutationCommand
  /** The known-good value to restore to. */
  readonly value: RuntimeSettingValue
  /** The stalled value we are reverting away from. */
  readonly from: RuntimeSettingValue
  readonly reason: "failed" | "timed-out"
}

/**
 * A stall we could not automatically recover from (no known-good to restore, or
 * the revert itself failed). Surfaced so recovery is never silent.
 */
export interface RuntimeRecoveryUnrecoverableAction {
  readonly kind: "record-unrecoverable"
  readonly command: RuntimeMutationCommand
  readonly value: RuntimeSettingValue
  readonly reason: "failed" | "timed-out"
  readonly detail: "no-known-good" | "revert-failed"
}

export type RuntimeRecoveryAction =
  | RuntimeRecoveryRevertAction
  | RuntimeRecoveryUnrecoverableAction

export interface RuntimeRecoveryStep {
  readonly state: RuntimeRecoveryState
  readonly action?: RuntimeRecoveryAction
}

function isMutationCommand(
  command: MoonlightControlCommandMethod,
): command is RuntimeMutationCommand {
  return (
    command === "runtime.setBitrate" ||
    command === "runtime.setFps" ||
    command === "runtime.setResolution"
  )
}

function isStall(
  status: MoonlightControlRuntimeSettingsStatus,
): status is "failed" | "timed-out" {
  return status === "failed" || status === "timed-out"
}

function valuesEqual(a: RuntimeSettingValue, b: RuntimeSettingValue): boolean {
  if (a.kind === "scalar" && b.kind === "scalar") {
    return a.value === b.value
  }
  if (a.kind === "resolution" && b.kind === "resolution") {
    return a.width === b.width && a.height === b.height
  }
  return false
}

function withoutPending(
  pending: RuntimeRecoveryState["pending"],
  key: string,
): RuntimeRecoveryState["pending"] {
  if (!(key in pending)) {
    return pending
  }
  const next = { ...pending }
  delete next[key]
  return next
}

/**
 * Advance recovery state by one input. Pure: returns the next state and, when a
 * stall is observed, a single action (revert or record). Applied outcomes
 * promote the value to known-good. Non-stall terminal outcomes (invalid,
 * disabled, unsupported, conflict, unauthorized, not-streaming) leave the live
 * settings unchanged, so they neither revert nor promote.
 */
export function reduceRuntimeRecovery(
  state: RuntimeRecoveryState,
  input: RuntimeRecoveryInput,
): RuntimeRecoveryStep {
  const key = String(input.requestId)

  if (input.kind === "sent") {
    if (!isMutationCommand(input.command)) {
      return { state }
    }
    return {
      state: {
        ...state,
        pending: {
          ...state.pending,
          [key]: {
            command: input.command,
            value: input.value,
            isRevert: input.isRevert ?? false,
          },
        },
      },
    }
  }

  const entry = state.pending[key]
  if (entry === undefined) {
    // No tracked command for this result (or already resolved); nothing to do.
    return { state }
  }

  // "accepted" is non-terminal; keep waiting for the terminal commandResult.
  if (input.status === "accepted") {
    return { state }
  }

  const pending = withoutPending(state.pending, key)

  if (input.status === "applied") {
    return {
      state: {
        pending,
        knownGood: { ...state.knownGood, [entry.command]: entry.value },
      },
    }
  }

  if (!isStall(input.status)) {
    // Rejected before taking effect (invalid/disabled/unsupported/conflict/...);
    // live settings did not change, so no revert and no promotion.
    return { state: { ...state, pending } }
  }

  const nextState: RuntimeRecoveryState = { ...state, pending }

  if (entry.isRevert) {
    // The revert we issued itself stalled — do not loop; surface it.
    return {
      state: nextState,
      action: {
        kind: "record-unrecoverable",
        command: entry.command,
        value: entry.value,
        reason: input.status,
        detail: "revert-failed",
      },
    }
  }

  const knownGood = state.knownGood[entry.command]
  if (knownGood !== undefined && !valuesEqual(knownGood, entry.value)) {
    return {
      state: nextState,
      action: {
        kind: "revert",
        command: entry.command,
        value: knownGood,
        from: entry.value,
        reason: input.status,
      },
    }
  }

  return {
    state: nextState,
    action: {
      kind: "record-unrecoverable",
      command: entry.command,
      value: entry.value,
      reason: input.status,
      detail: "no-known-good",
    },
  }
}
