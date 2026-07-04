// Runtime-settings recovery supervisor (Layer 3, U-B — the live half).
//
// This is the plumbing the scope doc defers to "build test-first now": it makes
// the pure runtime-recovery reducer actually run against a live stream. It
// drives runtime mutations through a streamer-agnostic control port, feeds every
// terminal outcome back into the reducer, and — when the reducer decides a
// change stalled — issues the revert to last known-good and surfaces the
// decision so recovery is never silent.
//
// It is NOT an external poller of screen state. The only signals it consumes are
// command outcomes that already flow over local-control (including the native
// `decode-stall` a resolution can raise, which arrives as a `failed` outcome).
// The one genuinely device-tuned number — the wait window for the first decoded
// frame — lives in the native client, not here.

import {
  currentRuntimeRecoveryKnownGood,
  hasPendingRuntimeRecoveryCommand,
  initialRuntimeRecoveryState,
  reduceRuntimeRecovery,
  type RuntimeCommandStatus,
  type RuntimeControlCommandMethod,
  type RuntimeMutationCommand,
  type RuntimeRecoveryAction,
  type RuntimeRecoveryRequestId,
  type RuntimeRecoveryState,
  type RuntimeSettingValue,
} from "./runtime-recovery"

/** A normalized terminal/accepted outcome for a runtime command. */
export interface RuntimeRecoveryResult {
  readonly requestId: RuntimeRecoveryRequestId
  readonly command: RuntimeControlCommandMethod
  readonly status: RuntimeCommandStatus
}

/**
 * The streamer-agnostic control surface the supervisor drives. A streamer
 * adapter (e.g. the Moonlight plugin) implements this over its own client:
 *
 * - Each setter issues the command and resolves to the native requestId the
 *   `command.accepted` response assigned, or `undefined` when the command was
 *   rejected before taking effect (e.g. `invalid`) so nothing needs tracking.
 *   It may reject only when the transport itself failed.
 * - `onResult` delivers terminal `runtime.commandResult` outcomes (the adapter
 *   has already subscribed to events).
 */
export interface RuntimeRecoveryControlPort {
  readonly setBitrate: (params: {
    readonly bitrateKbps: number
  }) => Promise<RuntimeRecoveryRequestId | undefined>
  readonly setFps: (params: {
    readonly fps: number
  }) => Promise<RuntimeRecoveryRequestId | undefined>
  readonly setResolution: (params: {
    readonly width: number
    readonly height: number
  }) => Promise<RuntimeRecoveryRequestId | undefined>
  readonly onResult: (
    listener: (result: RuntimeRecoveryResult) => void,
  ) => () => void
}

/** A recovery decision, surfaced so recovery is never silent. */
export type RuntimeRecoveryEvent =
  | {
      readonly kind: "revert"
      readonly command: RuntimeMutationCommand
      readonly from: RuntimeSettingValue
      readonly to: RuntimeSettingValue
      readonly reason: "failed" | "timed-out"
    }
  | {
      readonly kind: "unrecoverable"
      readonly command: RuntimeMutationCommand
      readonly value: RuntimeSettingValue
      readonly reason: "failed" | "timed-out"
      readonly detail: "no-known-good" | "revert-failed"
    }

export interface RuntimeRecoverySupervisorOptions {
  readonly port: RuntimeRecoveryControlPort
  /** Never-silent sink for recovery decisions (log + surface to the player). */
  readonly onEvent: (event: RuntimeRecoveryEvent) => void
  /**
   * Launch baseline seeded as the initial known-good, so the very first change
   * can still revert to a safe value. The last decode-confirmed applied value
   * supersedes it per command as the session runs.
   */
  readonly baseline?: Readonly<
    Partial<Record<RuntimeMutationCommand, RuntimeSettingValue>>
  >
}

export interface RuntimeRecoverySupervisor {
  readonly setBitrate: (bitrateKbps: number) => Promise<void>
  readonly setFps: (fps: number) => Promise<void>
  readonly setResolution: (width: number, height: number) => Promise<void>
  readonly hasPending: () => boolean
  readonly knownGood: () => RuntimeRecoveryState["knownGood"]
  readonly close: () => void
}

/**
 * Create a live recovery supervisor. Runtime mutations issued through its
 * setters are tracked; outcomes arriving over the port drive the reducer; a
 * stall auto-reverts to last known-good (or the baseline) and every decision is
 * surfaced through `onEvent`. Outcomes for commands the supervisor did not issue
 * (e.g. a manual CLI change on another connection) carry no tracked value and
 * are ignored — the supervisor only recovers changes it drove.
 */
export function createRuntimeRecoverySupervisor(
  options: RuntimeRecoverySupervisorOptions,
): RuntimeRecoverySupervisor {
  const { port, onEvent, baseline } = options
  let state: RuntimeRecoveryState = {
    pending: {},
    knownGood: { ...(baseline ?? {}) },
  }

  const advance = (
    input: Parameters<typeof reduceRuntimeRecovery>[1],
  ): void => {
    const stepResult = reduceRuntimeRecovery(state, input)
    state = stepResult.state
    if (stepResult.action) {
      handleAction(stepResult.action)
    }
  }

  function handleAction(action: RuntimeRecoveryAction): void {
    if (action.kind === "record-unrecoverable") {
      onEvent({
        kind: "unrecoverable",
        command: action.command,
        value: action.value,
        reason: action.reason,
        detail: action.detail,
      })
      return
    }

    onEvent({
      kind: "revert",
      command: action.command,
      from: action.from,
      to: action.value,
      reason: action.reason,
    })
    void dispatch(action.command, action.value, true).catch(() => {
      onEvent({
        kind: "unrecoverable",
        command: action.command,
        value: action.value,
        reason: action.reason,
        detail: "revert-failed",
      })
    })
  }

  function issue(
    command: RuntimeMutationCommand,
    value: RuntimeSettingValue,
  ): Promise<RuntimeRecoveryRequestId | undefined> {
    if (command === "runtime.setResolution" && value.kind === "resolution") {
      return port.setResolution({ width: value.width, height: value.height })
    }
    if (command === "runtime.setBitrate" && value.kind === "scalar") {
      return port.setBitrate({ bitrateKbps: value.value })
    }
    if (command === "runtime.setFps" && value.kind === "scalar") {
      return port.setFps({ fps: value.value })
    }
    return Promise.resolve(undefined)
  }

  async function dispatch(
    command: RuntimeMutationCommand,
    value: RuntimeSettingValue,
    isRevert: boolean,
  ): Promise<void> {
    const requestId = await issue(command, value)
    if (requestId !== undefined) {
      advance({ kind: "sent", requestId, command, value, isRevert })
    }
  }

  const unsubscribe = port.onResult(result => {
    advance({
      kind: "result",
      requestId: result.requestId,
      command: result.command,
      status: result.status,
    })
  })

  return {
    setBitrate: bitrateKbps =>
      dispatch(
        "runtime.setBitrate",
        { kind: "scalar", value: bitrateKbps },
        false,
      ),
    setFps: fps =>
      dispatch("runtime.setFps", { kind: "scalar", value: fps }, false),
    setResolution: (width, height) =>
      dispatch(
        "runtime.setResolution",
        { kind: "resolution", width, height },
        false,
      ),
    hasPending: () => hasPendingRuntimeRecoveryCommand(state),
    knownGood: () => currentRuntimeRecoveryKnownGood(state),
    close: () => unsubscribe(),
  }
}
