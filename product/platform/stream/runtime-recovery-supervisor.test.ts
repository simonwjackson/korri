import { describe, expect, it } from "bun:test"
import {
  createRuntimeRecoverySupervisor,
  type RuntimeRecoveryControlPort,
  type RuntimeRecoveryEvent,
  type RuntimeRecoveryResult,
} from "./runtime-recovery-supervisor"

interface PortCall {
  readonly command: string
  readonly params: Readonly<Record<string, number>>
  readonly requestId: string | undefined
}

type Programmed =
  | { readonly kind: "id"; readonly id: string | undefined }
  | { readonly kind: "reject" }

function makePort() {
  const listeners: ((result: RuntimeRecoveryResult) => void)[] = []
  const calls: PortCall[] = []
  const programmed: Programmed[] = []
  let counter = 0

  const record =
    (command: string) =>
    async (params: Readonly<Record<string, number>>) => {
      const next = programmed.shift()
      if (next?.kind === "reject") {
        calls.push({ command, params, requestId: undefined })
        throw new Error("transport failed")
      }
      const requestId =
        next?.kind === "id" ? next.id : `req-${(counter += 1)}`
      calls.push({ command, params, requestId })
      return requestId
    }

  const port: RuntimeRecoveryControlPort = {
    setBitrate: record("runtime.setBitrate"),
    setFps: record("runtime.setFps"),
    setResolution: record("runtime.setResolution"),
    onResult: listener => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }

  return {
    port,
    calls,
    emit: (result: RuntimeRecoveryResult) => {
      for (const listener of [...listeners]) listener(result)
    },
    /** Force the requestId the next setter call resolves to (undefined = rejected pre-effect). */
    queueRequestId: (id: string | undefined) =>
      programmed.push({ kind: "id", id }),
    /** Make the next setter call reject (transport failure). */
    queueReject: () => programmed.push({ kind: "reject" }),
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe("createRuntimeRecoverySupervisor", () => {
  it("promotes an applied change to known-good and does not revert it", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    await sup.setResolution(1280, 720)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "applied",
    })

    expect(events).toEqual([])
    expect(harness.calls).toHaveLength(1)
  })

  it("auto-reverts a stalled change to the last applied known-good", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    // First change lands and becomes known-good.
    await sup.setResolution(1280, 720)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "applied",
    })

    // Second change stalls (e.g. host applied but client could not decode).
    await sup.setResolution(800, 600)
    harness.emit({
      requestId: "req-2",
      command: "runtime.setResolution",
      status: "failed",
    })
    await flush()

    expect(events[0]).toEqual({
      kind: "revert",
      command: "runtime.setResolution",
      from: { kind: "resolution", width: 800, height: 600 },
      to: { kind: "resolution", width: 1280, height: 720 },
      reason: "failed",
    })
    // The revert was actually issued back to the known-good value.
    const revertCall = harness.calls.at(-1)
    expect(revertCall).toMatchObject({
      command: "runtime.setResolution",
      params: { width: 1280, height: 720 },
    })
  })

  it("reverts the first change to the seeded launch baseline", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
      baseline: {
        "runtime.setResolution": {
          kind: "resolution",
          width: 1920,
          height: 1080,
        },
      },
    })

    await sup.setResolution(800, 600)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "failed",
    })
    await flush()

    expect(events[0]).toMatchObject({
      kind: "revert",
      to: { kind: "resolution", width: 1920, height: 1080 },
    })
    expect(harness.calls.at(-1)).toMatchObject({
      params: { width: 1920, height: 1080 },
    })
  })

  it("records unrecoverable when a stall has no known-good", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    await sup.setResolution(800, 600)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "timed-out",
    })

    expect(events).toEqual([
      {
        kind: "unrecoverable",
        command: "runtime.setResolution",
        value: { kind: "resolution", width: 800, height: 600 },
        reason: "timed-out",
        detail: "no-known-good",
      },
    ])
    // No revert command was issued.
    expect(harness.calls).toHaveLength(1)
  })

  it("records unrecoverable when the revert itself stalls (no loop)", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    await sup.setResolution(1280, 720)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "applied",
    })

    await sup.setResolution(800, 600)
    harness.emit({
      requestId: "req-2",
      command: "runtime.setResolution",
      status: "failed",
    })
    await flush()

    // The revert (req-3) also stalls; must surface, not re-revert.
    harness.emit({
      requestId: "req-3",
      command: "runtime.setResolution",
      status: "failed",
    })
    await flush()

    expect(events.map(e => e.kind)).toEqual(["revert", "unrecoverable"])
    const last = events.at(-1)
    expect(last).toMatchObject({
      kind: "unrecoverable",
      detail: "revert-failed",
    })
    // No fourth command was issued after the failed revert.
    expect(harness.calls).toHaveLength(3)
  })

  it("records revert-failed when the revert cannot even be dispatched", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    await sup.setResolution(1280, 720)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "applied",
    })

    await sup.setResolution(800, 600)
    // The revert (the next setter call) fails at the transport.
    harness.queueReject()
    harness.emit({
      requestId: "req-2",
      command: "runtime.setResolution",
      status: "failed",
    })
    await flush()

    expect(events.map(e => e.kind)).toEqual(["revert", "unrecoverable"])
    expect(events.at(-1)).toMatchObject({
      kind: "unrecoverable",
      detail: "revert-failed",
    })
  })

  it("ignores outcomes for commands it did not issue", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    // A failed outcome for a requestId the supervisor never sent (e.g. a manual
    // CLI change on another connection) must not trigger any recovery.
    harness.emit({
      requestId: "external-9",
      command: "runtime.setResolution",
      status: "failed",
    })

    expect(events).toEqual([])
    expect(harness.calls).toHaveLength(0)
  })

  it("does not revert a non-stall terminal outcome", async () => {
    const events: RuntimeRecoveryEvent[] = []
    const harness = makePort()
    const sup = createRuntimeRecoverySupervisor({
      port: harness.port,
      onEvent: e => events.push(e),
    })

    await sup.setResolution(1280, 720)
    harness.emit({
      requestId: "req-1",
      command: "runtime.setResolution",
      status: "applied",
    })

    // A rejected-before-effect outcome (invalid) leaves live settings unchanged.
    await sup.setResolution(1, 1)
    harness.emit({
      requestId: "req-2",
      command: "runtime.setResolution",
      status: "invalid",
    })
    await flush()

    expect(events).toEqual([])
    // Only the two user commands; no revert.
    expect(harness.calls).toHaveLength(2)
  })
})
