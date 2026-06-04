import { describe, expect, it } from "bun:test"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import {
  Launcher,
  type LauncherService,
} from "@platform/library/library-services"
import { Effect } from "effect"
import {
  createLocalForegroundLaunchOwner,
  launchLocalForegroundSession,
} from "./local-foreground-launch-adapter"

const spec = { command: "/bin/game", args: ["rom"] }

function spawnWith(launcher: LauncherService) {
  const spawn = launcher.spawn
  if (!spawn) throw new Error("launcher missing managed spawn")
  return Effect.runPromise(spawn(spec))
}

async function launcherFromLayer(
  layer: ReturnType<typeof makeInMemoryLauncherLayer>,
) {
  return await Effect.runPromise(
    Effect.gen(function* () {
      return yield* Launcher
    }).pipe(Effect.provide(layer)),
  )
}

describe("local foreground launch adapter", () => {
  it("holds the owner running until the managed local child exits", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner()

    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })
    await waitForOwnerState(owner, "Running")

    expect(owner.status().state).toMatchObject({
      _tag: "Running",
      active: { requestId: "local-launch-1", gameId: "game" },
    })

    control.resolveExit({ exitCode: 0 })
    expect(await launch).toEqual({ _tag: "Accepted", status: "launched" })
    await owner.whenIdle()
  })

  it("rejects a second local launch as session-busy before invoking spawn", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner()
    let secondSpawnCalls = 0

    const first = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })
    await waitForOwnerState(owner, "Running")

    const second = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => {
        secondSpawnCalls += 1
        return spawnWith(launcher)
      },
      createRequestId: () => "local-launch-2",
    })

    // Back-compat assertion: old callers reading only `status`/`failureKind`
    // still see exit-121 / session-busy. New callers branch on `_tag` and
    // `preflightReason.source`.
    expect(second).toMatchObject({
      _tag: "PreflightRejected",
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
      preflightReason: { source: "owner-local" },
    })
    expect(secondSpawnCalls).toBe(0)

    control.resolveExit({ exitCode: 0 })
    await first
    await owner.whenIdle()
  })

  it("waits for managed readiness evidence after child exit before releasing idle", async () => {
    const owner = createLocalForegroundLaunchOwner()
    const exited = deferred<{ readonly exitCode: number | null }>()
    const ready = deferred<{
      readonly status: "ok"
      readonly evidence: { readonly gate: string }
    }>()
    let settled = false

    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: async () => ({
        status: "started",
        result: ready.promise.then(() => ({ status: "launched" as const })),
        session: {
          id: "sessiond:launch-1",
          exited: exited.promise,
          ready: ready.promise,
          terminate: () => {},
          terminateNow: () => {},
        },
      }),
      createRequestId: () => "local-launch-1",
    })
    void launch.then(() => {
      settled = true
    })

    await waitForOwnerState(owner, "Running")
    exited.resolve({ exitCode: 0 })
    await waitForOwnerState(owner, "VerifyingReady")
    await Promise.resolve()

    expect(owner.status().state._tag).toBe("VerifyingReady")
    expect(settled).toBe(false)

    ready.resolve({ status: "ok", evidence: { gate: "sessiond-home-ready" } })
    expect(await launch).toEqual({ _tag: "Accepted", status: "launched" })
    await owner.whenIdle()
  })

  it("returns failed launch response when managed readiness evidence fails", async () => {
    const owner = createLocalForegroundLaunchOwner()
    const exited = deferred<{ readonly exitCode: number | null }>()
    const ready = deferred<{
      readonly status: "failed"
      readonly message: string
      readonly evidence: { readonly gate: string }
    }>()

    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: async () => ({
        status: "started",
        result: ready.promise.then(result =>
          result.status === "failed"
            ? {
                status: "failed" as const,
                exitCode: 1,
                failureKind: "command-failed" as const,
                stderrTail: result.message,
              }
            : { status: "launched" as const },
        ),
        session: {
          id: "sessiond:launch-1",
          exited: exited.promise,
          ready: ready.promise,
          terminate: () => {},
          terminateNow: () => {},
        },
      }),
      createRequestId: () => "local-launch-1",
    })

    await waitForOwnerState(owner, "Running")
    exited.resolve({ exitCode: 0 })
    await waitForOwnerState(owner, "VerifyingReady")
    ready.resolve({
      status: "failed",
      message: "renderer restore failed",
      evidence: { gate: "sessiond-home-ready" },
    })

    expect(await launch).toEqual({
      _tag: "LaunchFailed",
      status: "failed",
      exitCode: 1,
      failureKind: "command-failed",
      stderrTail: "renderer restore failed",
    })
    await owner.whenIdle()
  })

  it("returns managed spawn failure diagnostics", async () => {
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({
        behavior: { kind: "fail", exitCode: 125, stderrTail: "unsupported" },
      }),
    )
    const owner = createLocalForegroundLaunchOwner()

    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })

    expect(result).toEqual({
      _tag: "LaunchFailed",
      status: "failed",
      exitCode: 125,
      stderrTail: "unsupported",
    })
    expect(owner.status().state._tag).toBe("IdleReady")
  })
})

describe("local foreground launch adapter > sessiond preflight", () => {
  it("surfaces an ExternalUnavailable network rejection as host-unavailable / exit 124", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    let spawnCalls = 0
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({
        status: "unavailable",
        reason: "network",
        message: "sessiond unreachable",
      }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => {
        spawnCalls += 1
        return spawnWith(launcher)
      },
      createRequestId: () => "local-launch-1",
    })
    expect(result).toMatchObject({
      _tag: "HostUnavailable",
      status: "failed",
      exitCode: 124,
      failureKind: "host-unavailable",
      stderrTail: "sessiond unreachable",
      hostUnavailableReason: { kind: "network" },
    })
    expect(spawnCalls).toBe(0)
  })

  it("preserves 401 → host-control-disabled / exit 126 for token-rejected", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    let spawnCalls = 0
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({
        status: "unavailable",
        reason: "token-rejected",
      }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => {
        spawnCalls += 1
        return spawnWith(launcher)
      },
      createRequestId: () => "local-launch-1",
    })
    // Back-compat assertion: 401 preserves the existing
    // `host-control-disabled` / exit-126 mapping from session-launcher.ts;
    // the new `_tag` / `hostUnavailableReason.kind` discriminator surfaces
    // the token-rejected source for new callers.
    expect(result).toMatchObject({
      _tag: "HostUnavailable",
      status: "failed",
      exitCode: 126,
      failureKind: "host-control-disabled",
      hostUnavailableReason: { kind: "token-rejected" },
    })
    expect(spawnCalls).toBe(0)
  })

  it("surfaces a sessiond-busy preflight as session-busy / exit 121 without invoking spawn", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    let spawnCalls = 0
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({
        status: "not-idle",
        mode: "game",
      }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => {
        spawnCalls += 1
        return spawnWith(launcher)
      },
      createRequestId: () => "local-launch-1",
    })
    expect(result).toMatchObject({
      _tag: "PreflightRejected",
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
      preflightReason: { source: "sessiond", externalMode: "game" },
    })
    expect(spawnCalls).toBe(0)
  })

  it("accepts the launch when consultExternalIdle reports idle", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({ status: "idle" }),
    })
    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })
    await waitForOwnerState(owner, "Running")
    control.resolveExit({ exitCode: 0 })
    expect(await launch).toEqual({ _tag: "Accepted", status: "launched" })
    await owner.whenIdle()
  })
})

describe("local foreground launch adapter > U3 wire-shape discrimination", () => {
  // The launch RPC response surfaces a discriminated `_tag` so callers can
  // distinguish the rejection source. Existing fields (status, exitCode,
  // failureKind, stderrTail) remain populated for back-compat. These tests
  // assert the exact tag + back-compat field pairs across the matrix.

  it("Accepted: launched response carries _tag=Accepted with status=launched preserved", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({ status: "idle" }),
    })
    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-accepted",
    })
    await waitForOwnerState(owner, "Running")
    control.resolveExit({ exitCode: 0 })
    expect(await launch).toEqual({ _tag: "Accepted", status: "launched" })
    await owner.whenIdle()
  })

  it("PreflightRejected (sessiond): _tag + back-compat exit 121 + reason.source=sessiond", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({ status: "not-idle", mode: "game" }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-pre-sessiond",
    })
    // Tag + reason discrimination
    expect(result).toMatchObject({
      _tag: "PreflightRejected",
      preflightReason: { source: "sessiond", externalMode: "game" },
    })
    // Back-compat fields preserved for callers reading status/failureKind only
    expect(result).toMatchObject({
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    // SEC-001 (task-017): symmetric guard for the sessiond rejection
    // path. If a future change splits per-source code paths and
    // reintroduces `currentState` only on this branch, this assertion
    // fails before the wire ships the leak.
    expect(
      (result as { preflightReason?: Record<string, unknown> }).preflightReason,
    ).not.toHaveProperty("currentState")
    // SEC-001 bypass guard: stderrTail must NOT embed the owner FSM tag
    // either — leaking the same information via a different field
    // would defeat the redaction. Asserts against every FSM tag the
    // owner can produce, not just the one in flight for this test.
    const tail = (result as { stderrTail?: string }).stderrTail ?? ""
    for (const tag of [
      "IdleReady",
      "Preparing",
      "Spawning",
      "Foregrounding",
      "Running",
      "ExitObserved",
      "TearingDown",
      "VerifyingReady",
      "Failed",
      "Recovering",
    ]) {
      expect(tail).not.toContain(tag)
    }
  })

  it("PreflightRejected (owner-local): _tag + back-compat exit 121 + reason.source=owner-local", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({ status: "idle" }),
    })
    const first = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-pre-local-1",
    })
    await waitForOwnerState(owner, "Running")
    const second = await launchLocalForegroundSession(owner, {
      id: "game-2",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-pre-local-2",
    })
    expect(second).toMatchObject({
      _tag: "PreflightRejected",
      preflightReason: { source: "owner-local" },
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    // task-013 AC #2: stable correlation identifiers reach the wire.
    // The first launch ("u3-pre-local-1") is the busy session; its
    // requestId and sessionId (from the in-memory session handle)
    // must surface on the second launch's rejection.
    expect(
      (second as { preflightReason?: Record<string, unknown> }).preflightReason,
    ).toMatchObject({
      currentRequestId: "u3-pre-local-1",
      currentGameId: "game",
      // The in-memory launcher's session id is exposed as the
      // sessionId here; sessiond-backed launchers expose the
      // sessiond launchId via the same field.
    })
    // SEC-001 (task-017): the owner FSM tag must NOT appear on the wire.
    // `app.library.launch` is unauthenticated on the trusted-LAN shape;
    // leaking the internal pipeline stage gives unauthenticated callers
    // finer-grained visibility than `app.server.status` already exposes.
    expect(
      (second as { preflightReason?: Record<string, unknown> }).preflightReason,
    ).not.toHaveProperty("currentState")
    // task-013 AC #3: process identity is daemon-private. The wire
    // response must NOT carry currentProcessId / currentProcessGroupId
    // even when the `ForegroundManagedSessionHandle` had them.
    const flat = JSON.stringify(second)
    expect(flat).not.toContain("currentProcessId")
    expect(flat).not.toContain("processGroupId")
    control.resolveExit({ exitCode: 0 })
    await first
    await owner.whenIdle()
  })

  it("HostUnavailable (network): _tag + back-compat exit 124 + reason.kind=network", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({
        status: "unavailable",
        reason: "network",
      }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-host-network",
    })
    expect(result).toMatchObject({
      _tag: "HostUnavailable",
      hostUnavailableReason: { kind: "network" },
      status: "failed",
      exitCode: 124,
      failureKind: "host-unavailable",
    })
  })

  it("HostUnavailable (token-rejected): _tag + back-compat exit 126 + failureKind=host-control-disabled", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({
        status: "unavailable",
        reason: "token-rejected",
      }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-host-token",
    })
    // CRITICAL back-compat assertion: 401 preserves exit 126 /
    // host-control-disabled from session-launcher.ts's spawn-time mapping.
    expect(result).toMatchObject({
      _tag: "HostUnavailable",
      hostUnavailableReason: { kind: "token-rejected" },
      status: "failed",
      exitCode: 126,
      failureKind: "host-control-disabled",
    })
  })

  it("DaemonRejected: spawn-pipeline returns session-busy → _tag=DaemonRejected with daemonReason.source=spawn-post", async () => {
    // Simulate sessiond rejecting the POST after the preflight cleared:
    // the spawn pipeline produces { status: "failed", failureKind:
    // "session-busy" } via launchResponseFromLaunchResult. This must
    // surface as DaemonRejected, NOT PreflightRejected, so callers can
    // tell apart "local owner caught it" from "daemon rejected after
    // preflight passed."
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({
        behavior: {
          kind: "fail",
          exitCode: 121,
          stderrTail: "sessiond rejected POST",
          failureKind: "session-busy",
        },
      }),
    )
    const owner = createLocalForegroundLaunchOwner({
      // Preflight passes; the rejection happens at spawn time.
      consultExternalIdle: async () => ({ status: "idle" }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-daemon",
    })
    expect(result).toMatchObject({
      _tag: "DaemonRejected",
      daemonReason: { source: "spawn-post" },
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
      stderrTail: "sessiond rejected POST",
    })
  })

  it("LaunchFailed: _tag + back-compat status=failed for process-level failures", async () => {
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({
        behavior: { kind: "fail", exitCode: 42, stderrTail: "oops" },
      }),
    )
    const owner = createLocalForegroundLaunchOwner({
      consultExternalIdle: async () => ({ status: "idle" }),
    })
    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "u3-launch-failed",
    })
    expect(result).toEqual({
      _tag: "LaunchFailed",
      status: "failed",
      exitCode: 42,
      stderrTail: "oops",
    })
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForOwnerState(
  owner: ReturnType<typeof createLocalForegroundLaunchOwner>,
  state: ReturnType<typeof owner.status>["state"]["_tag"],
) {
  for (let index = 0; index < 20; index += 1) {
    if (owner.status().state._tag === state) return
    await Promise.resolve()
  }
  expect(owner.status().state._tag).toBe(state)
}
