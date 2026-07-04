import { describe, expect, it } from "bun:test"
import {
  currentRuntimeRecoveryKnownGood,
  hasPendingRuntimeRecoveryCommand,
  initialRuntimeRecoveryState,
  type RuntimeRecoveryInput,
  type RuntimeRecoveryState,
  type RuntimeSettingValue,
  reduceRuntimeRecovery,
} from "./runtime-recovery"

const res = (width: number, height: number): RuntimeSettingValue => ({
  kind: "resolution",
  width,
  height,
})
const scalar = (value: number): RuntimeSettingValue => ({
  kind: "scalar",
  value,
})

function run(inputs: readonly RuntimeRecoveryInput[]): {
  state: RuntimeRecoveryState
  actions: ReturnType<typeof reduceRuntimeRecovery>["action"][]
} {
  let state = initialRuntimeRecoveryState
  const actions: ReturnType<typeof reduceRuntimeRecovery>["action"][] = []
  for (const input of inputs) {
    const step = reduceRuntimeRecovery(state, input)
    state = step.state
    if (step.action) {
      actions.push(step.action)
    }
  }
  return { state, actions }
}

describe("reduceRuntimeRecovery", () => {
  it("promotes an applied resolution to known-good and reverts a later stall", () => {
    const { actions } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.setResolution",
        value: res(1280, 720),
      },
      {
        kind: "result",
        requestId: 1,
        command: "runtime.setResolution",
        status: "applied",
      },
      {
        kind: "sent",
        requestId: 2,
        command: "runtime.setResolution",
        value: res(854, 480),
      },
      {
        kind: "result",
        requestId: 2,
        command: "runtime.setResolution",
        status: "failed",
      },
    ])

    expect(actions).toEqual([
      {
        kind: "revert",
        command: "runtime.setResolution",
        value: res(1280, 720),
        from: res(854, 480),
        reason: "failed",
      },
    ])
  })

  it("treats a timed-out outcome as a stall and reverts", () => {
    const { actions } = run([
      {
        kind: "sent",
        requestId: 10,
        command: "runtime.setBitrate",
        value: scalar(20000),
      },
      {
        kind: "result",
        requestId: 10,
        command: "runtime.setBitrate",
        status: "applied",
      },
      {
        kind: "sent",
        requestId: 11,
        command: "runtime.setBitrate",
        value: scalar(50000),
      },
      {
        kind: "result",
        requestId: 11,
        command: "runtime.setBitrate",
        status: "timed-out",
      },
    ])

    expect(actions).toEqual([
      {
        kind: "revert",
        command: "runtime.setBitrate",
        value: scalar(20000),
        from: scalar(50000),
        reason: "timed-out",
      },
    ])
  })

  it("records unrecoverable when a stall has no known-good to restore", () => {
    const { actions } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.setResolution",
        value: res(640, 360),
      },
      {
        kind: "result",
        requestId: 1,
        command: "runtime.setResolution",
        status: "failed",
      },
    ])

    expect(actions).toEqual([
      {
        kind: "record-unrecoverable",
        command: "runtime.setResolution",
        value: res(640, 360),
        reason: "failed",
        detail: "no-known-good",
      },
    ])
  })

  it("does not loop: a revert that itself stalls is recorded, not re-reverted", () => {
    const { actions } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.setResolution",
        value: res(1920, 1080),
      },
      {
        kind: "result",
        requestId: 1,
        command: "runtime.setResolution",
        status: "applied",
      },
      {
        kind: "sent",
        requestId: 2,
        command: "runtime.setResolution",
        value: res(1280, 720),
      },
      {
        kind: "result",
        requestId: 2,
        command: "runtime.setResolution",
        status: "failed",
      },
      // Supervisor issues the revert to 1920x1080 with isRevert; it too stalls.
      {
        kind: "sent",
        requestId: 3,
        command: "runtime.setResolution",
        value: res(1920, 1080),
        isRevert: true,
      },
      {
        kind: "result",
        requestId: 3,
        command: "runtime.setResolution",
        status: "timed-out",
      },
    ])

    expect(actions).toEqual([
      {
        kind: "revert",
        command: "runtime.setResolution",
        value: res(1920, 1080),
        from: res(1280, 720),
        reason: "failed",
      },
      {
        kind: "record-unrecoverable",
        command: "runtime.setResolution",
        value: res(1920, 1080),
        reason: "timed-out",
        detail: "revert-failed",
      },
    ])
  })

  it("does not revert on a pre-apply rejection (live settings unchanged)", () => {
    const { state, actions } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.setResolution",
        value: res(1280, 720),
      },
      {
        kind: "result",
        requestId: 1,
        command: "runtime.setResolution",
        status: "applied",
      },
      {
        kind: "sent",
        requestId: 2,
        command: "runtime.setResolution",
        value: res(640, 480),
      },
      {
        kind: "result",
        requestId: 2,
        command: "runtime.setResolution",
        status: "invalid",
      },
    ])

    expect(actions).toEqual([])
    // Known-good is untouched by the rejected request.
    expect(state.knownGood["runtime.setResolution"]).toEqual(res(1280, 720))
    // The rejected request is cleared from pending.
    expect(state.pending).toEqual({})
  })

  it("never resolves a stall silently: always a revert or a record", () => {
    for (const status of ["failed", "timed-out"] as const) {
      const { actions } = run([
        {
          kind: "sent",
          requestId: 1,
          command: "runtime.setFps",
          value: scalar(30),
        },
        { kind: "result", requestId: 1, command: "runtime.setFps", status },
      ])
      expect(actions).toHaveLength(1)
    }
  })

  it("ignores non-mutation commands and unknown request ids", () => {
    const { state, actions } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.requestIdr",
        value: scalar(0),
      },
      {
        kind: "result",
        requestId: 1,
        command: "runtime.requestIdr",
        status: "applied",
      },
      {
        kind: "result",
        requestId: 999,
        command: "runtime.setResolution",
        status: "failed",
      },
    ])

    expect(actions).toEqual([])
    expect(state.knownGood).toEqual({})
    expect(state.pending).toEqual({})
  })

  it("keeps a command pending across a non-terminal accepted result", () => {
    const { state } = run([
      {
        kind: "sent",
        requestId: 7,
        command: "runtime.setResolution",
        value: res(1024, 576),
      },
      {
        kind: "result",
        requestId: 7,
        command: "runtime.setResolution",
        status: "accepted",
      },
    ])

    expect(state.pending["7"]).toEqual({
      command: "runtime.setResolution",
      value: res(1024, 576),
      isRevert: false,
    })
  })

  it("reports pending state and known-good snapshot for autonomous callers", () => {
    const { state } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.setBitrate",
        value: scalar(10_000),
      },
    ])

    expect(hasPendingRuntimeRecoveryCommand(state)).toBe(true)
    expect(currentRuntimeRecoveryKnownGood(state)).toEqual({})

    const applied = reduceRuntimeRecovery(state, {
      kind: "result",
      requestId: 1,
      command: "runtime.setBitrate",
      status: "applied",
    }).state

    expect(hasPendingRuntimeRecoveryCommand(applied)).toBe(false)
    expect(currentRuntimeRecoveryKnownGood(applied)).toEqual({
      "runtime.setBitrate": scalar(10_000),
    })
  })

  it("returns a read-only known-good snapshot copy", () => {
    const { state } = run([
      {
        kind: "sent",
        requestId: 1,
        command: "runtime.setFps",
        value: scalar(60),
      },
      {
        kind: "result",
        requestId: 1,
        command: "runtime.setFps",
        status: "applied",
      },
    ])

    const snapshot = currentRuntimeRecoveryKnownGood(state) as Record<
      string,
      RuntimeSettingValue | undefined
    >
    snapshot["runtime.setFps"] = scalar(30)

    expect(currentRuntimeRecoveryKnownGood(state)).toEqual({
      "runtime.setFps": scalar(60),
    })
  })
})
