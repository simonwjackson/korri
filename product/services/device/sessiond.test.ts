import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
} from "@platform/library/launcher"
import type { SessiondManagedLaunchEvent } from "@platform/library/sessiond-managed-launch-protocol"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"
import {
  createSteamSessionLifecycleHook,
  KORRI_STEAM_PLUGIN_ID,
  type SteamForegroundProcessInfo,
} from "@product/plugins/steam"
import {
  createKorriSessiondCore,
  type KorriSessiondCore,
  type KorriSessiondLifecycleHook,
  type KorriSessiondLifecycleHookCleanupRequest,
  type KorriSessiondLifecycleHookCleanupResult,
  type KorriSessiondLifecycleHookStartRequest,
  KorriSessiondPreSpawnFailure,
  type KorriSessiondPreSpawnGate,
  startKorriSessiond,
} from "./sessiond"
import type { SessionRole } from "./sessiond-role"
import type { KorriWindowSnapshot } from "./sessiond-state"
import { MAX_RESTORE_ATTEMPTS } from "./sessiond-state"
import type {
  SessiondLifecycleSnapshot,
  StatusSidecar,
} from "./sessiond-status-sidecar"

const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }

function steamLaunchMetadata(appId: string): LaunchMetadata {
  return {
    appProviderId: KORRI_STEAM_PLUGIN_ID,
    annotations: {
      [KORRI_STEAM_PLUGIN_ID]: {
        foregroundCleanup: { appId },
      },
    },
  }
}

function startHarness(
  options: {
    readonly windows?: readonly KorriWindowSnapshot[]
    readonly launchResult?: LaunchResult
    readonly failRendererLaunch?: boolean
    readonly failRendererRestore?: boolean
    readonly rendererRestoreFailures?: number
    readonly runLaunch?: (spec: LaunchSpec) => Promise<LaunchResult>
    readonly spawnLaunch?: (spec: LaunchSpec) => Promise<{
      readonly result: Promise<LaunchResult>
      readonly terminate: () => void
      readonly terminateNow: () => void
      readonly freeze?: () => void
      readonly thaw?: () => void
      readonly processGroupId?: number
    }>
    readonly sessionHooks?: readonly KorriSessiondLifecycleHook[]
    readonly preSpawnGates?: readonly KorriSessiondPreSpawnGate[]
    readonly managedStopGraceMs?: number
    readonly restoreRetryDelayMs?: number
    readonly heartbeatIntervalMs?: number
    readonly role?: SessionRole
    readonly fakeSuspendActiveMarkerPath?: string
  } = {},
) {
  const events: string[] = []
  let rendererPid = 100
  let windows = [...(options.windows ?? [])]
  const core = createKorriSessiondCore({
    logger: silentLogger,
    serviceManager: {
      maskEssway: async () => {
        events.push("mask-es")
      },
      restoreEssway: async () => {
        events.push("restore-es")
      },
    },
    renderer: {
      kind: "chromium",
      launch: async () => {
        const launchCount = events.filter(
          event => event === "launch-renderer",
        ).length
        events.push("launch-renderer")
        if (
          options.failRendererLaunch ||
          (options.failRendererRestore && launchCount > 0) ||
          (options.rendererRestoreFailures !== undefined &&
            launchCount > 0 &&
            launchCount <= options.rendererRestoreFailures)
        )
          throw new Error("renderer failed")
        rendererPid += 1
        windows = [{ id: rendererPid, focused: true, fullscreen: true }]
        return {
          pid: rendererPid,
          command: { command: "chromium", args: [] },
        }
      },
      stop: async pid => {
        events.push(`stop-renderer:${pid ?? "none"}`)
        windows = []
      },
    },
    sway: {
      getKorriWindows: async () => windows,
      applyDecisions: async decisions => {
        events.push(...decisions.map(decision => `sway:${decision.kind}`))
        return []
      },
    },
    launcher: {
      run: async receivedSpec => {
        events.push(`launch-game:${receivedSpec.command}`)
        if (options.runLaunch) return await options.runLaunch(receivedSpec)
        return options.launchResult ?? { status: "launched" }
      },
      spawn: options.spawnLaunch
        ? async receivedSpec => {
            events.push(`launch-game:${receivedSpec.command}`)
            const spawned = await options.spawnLaunch?.(receivedSpec)
            if (!spawned) throw new Error("missing spawned launch")
            return {
              status: "started" as const,
              result: spawned.result,
              session: {
                id: "sessiond-child",
                ...(spawned.processGroupId !== undefined
                  ? { processGroupId: spawned.processGroupId }
                  : {}),
                exited: spawned.result.then(result => ({
                  exitCode: result.status === "launched" ? 0 : result.exitCode,
                })),
                terminate: spawned.terminate,
                terminateNow: spawned.terminateNow,
                ...(spawned.freeze ? { freeze: spawned.freeze } : {}),
                ...(spawned.thaw ? { thaw: spawned.thaw } : {}),
              },
            }
          }
        : undefined,
    },
    sessionHooks: options.sessionHooks,
    preSpawnGates: options.preSpawnGates,
    ...(options.role ? { role: options.role } : {}),
    ...(options.fakeSuspendActiveMarkerPath
      ? { fakeSuspendActiveMarkerPath: options.fakeSuspendActiveMarkerPath }
      : {}),
    ...(options.managedStopGraceMs !== undefined
      ? { managedStopGraceMs: options.managedStopGraceMs }
      : {}),
    restoreRetryDelayMs: options.restoreRetryDelayMs ?? 1,
    ...(options.heartbeatIntervalMs !== undefined
      ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
      : {}),
  })
  return { core, events }
}

function cleanupHook(
  cleanup: NonNullable<KorriSessiondLifecycleHook["cleanup"]>,
): KorriSessiondLifecycleHook {
  return { id: "test-cleanup", cleanup }
}

function afterChildHook(
  afterChildRunning: NonNullable<
    KorriSessiondLifecycleHook["afterChildRunning"]
  >,
): KorriSessiondLifecycleHook {
  return {
    id: "test-after-child",
    failurePolicy: "fail-launch",
    afterChildRunning,
  }
}

function request(
  core: KorriSessiondCore,
  path: string,
  init: RequestInit = {},
) {
  return core.handleRequest(new Request(`http://127.0.0.1:3003${path}`, init))
}

function authorized(init: RequestInit = {}): RequestInit {
  return init
}

describe("korri sessiond", () => {
  it("starts Korri mode by masking ES, launching Chromium, and entering home", async () => {
    const { core, events } = startHarness()

    const response = await request(
      core,
      "/control/start",
      authorized({ method: "POST" }),
    )
    expect(response.ok).toBe(true)
    const body = await response.json()

    expect(body.state.mode).toBe("home")
    expect(events).toContain("mask-es")
    expect(events).toContain("launch-renderer")
  })

  it("accepts same-user socket control requests without token headers", async () => {
    const { core, events } = startHarness()

    const response = await request(core, "/control/start", { method: "POST" })

    expect(response.ok).toBe(true)
    expect(events).toContain("launch-renderer")
    expect(core.status().state.mode).toBe("home")
  })

  it("launches a game under session control and restores Chromium afterward", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result).toEqual({ status: "launched" })
    expect(body.state.mode).toBe("home")
    expect(body.renderer).toEqual({ kind: "chromium", pid: 102 })
    expect(events).toContain("stop-renderer:101")
    expect(events).toContain("launch-game:/bin/game")
    expect(events.filter(event => event === "launch-renderer")).toHaveLength(2)
  })

  it("restores Chromium even when the game exits non-zero", async () => {
    const { core, events } = startHarness({
      launchResult: { status: "failed", exitCode: 7, stderrTail: "boom" },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result).toEqual({
      status: "failed",
      exitCode: 7,
      stderrTail: "boom",
    })
    expect(body.state.mode).toBe("home")
    expect(events.filter(event => event === "launch-renderer")).toHaveLength(2)
  })

  it("rejects launches when the session is not in home mode", async () => {
    const { core, events } = startHarness()

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result.status).toBe("failed")
    expect(events).not.toContain("launch-game:/bin/game")
  })

  it("starts a managed launch promptly and emits lifecycle events through restored home", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      runLaunch: async () => await control.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({ status: "accepted", launchId: "launch-1" })
    expect(core.status().state.mode).toBe("game")
    expect(events).toContain("launch-game:/bin/game")

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
      authorized(),
    )
    const streamText = streamResponse.text()

    control.resolve({ status: "launched" })
    const lifecycle = parseSseEvents(await streamText)

    expect(lifecycle.map(event => event.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "child-exited",
      "restoring",
      "home-ready",
    ])
    expect(core.status().state.mode).toBe("home")
  })

  it("omits renderer-stopped for lane-aware managed launches", async () => {
    const control = deferred<LaunchResult>()
    const roleEvents: string[] = []
    const { core } = startHarness({
      runLaunch: async () => await control.promise,
      role: {
        id: "kiosk-lanes",
        idleModeLabel: "home",
        idleReadyEventName: "home-ready",
        emitsRendererStopped: false,
        enterIdle: async () => {
          roleEvents.push("enter-idle")
        },
        leaveIdle: async () => {
          roleEvents.push("leave-idle")
        },
        beforeChildLaunch: async () => {
          roleEvents.push("before-child")
        },
        afterChildRunning: async () => {
          roleEvents.push("after-child")
        },
        restoreIdleAfterLaunch: async () => {
          roleEvents.push("restore-idle")
        },
        reconcileIdle: async () => {
          roleEvents.push("reconcile-idle")
        },
        toggleHome: async () => {
          roleEvents.push("toggle-home")
          return { status: "focused-hub" }
        },
        idleReadyEvidence: () => "home-invariant windows=1 satisfied",
        rendererStatus: () => ({ kind: "test-renderer", pid: 101 }),
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-lanes", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-lanes",
      authorized(),
    )
    const streamText = streamResponse.text()

    control.resolve({ status: "launched" })
    const lifecycle = parseSseEvents(await streamText)

    expect(lifecycle.map(event => event.type)).toEqual([
      "launch-accepted",
      "child-running",
      "child-exited",
      "restoring",
      "home-ready",
    ])
    expect(roleEvents).toEqual([
      "enter-idle",
      "before-child",
      "after-child",
      "restore-idle",
    ])
  })

  it("routes Home lane toggle requests through capable roles", async () => {
    const roleEvents: string[] = []
    const { core } = startHarness({
      role: {
        id: "kiosk-lanes",
        idleModeLabel: "home",
        idleReadyEventName: "home-ready",
        emitsRendererStopped: false,
        enterIdle: async () => {},
        leaveIdle: async () => {},
        beforeChildLaunch: async () => {},
        afterChildRunning: async () => {},
        restoreIdleAfterLaunch: async () => {},
        reconcileIdle: async () => {},
        toggleHome: async () => {
          roleEvents.push("toggle-home")
          return { status: "no-live-game" }
        },
        idleReadyEvidence: () => "home-invariant windows=1 satisfied",
        rendererStatus: () => ({ kind: "test-renderer", pid: 101 }),
      },
    })

    const statusResponse = await request(core, "/managed-launch/status")
    const status = await statusResponse.json()
    expect(status.capabilities.laneToggle).toBe(true)

    const response = await request(core, "/managed-launch/home-toggle", {
      method: "POST",
    })

    expect(await response.json()).toEqual({ status: "no-live-game" })
    expect(roleEvents).toEqual(["toggle-home"])
  })

  it("does not advertise Home lane toggle while the role reports unavailable", async () => {
    const { core } = startHarness({
      role: {
        id: "kiosk-lanes",
        idleModeLabel: "home",
        idleReadyEventName: "home-ready",
        emitsRendererStopped: false,
        enterIdle: async () => {},
        leaveIdle: async () => {},
        beforeChildLaunch: async () => {},
        afterChildRunning: async () => {},
        restoreIdleAfterLaunch: async () => {},
        reconcileIdle: async () => {},
        homeToggleAvailable: () => false,
        toggleHome: async () => ({ status: "focused-hub" }),
        idleReadyEvidence: () => "home-invariant windows=1 satisfied",
        rendererStatus: () => ({ kind: "test-renderer", pid: 101 }),
      },
    })

    const statusResponse = await request(core, "/managed-launch/status")
    const status = await statusResponse.json()
    expect(status.capabilities.laneToggle).toBeUndefined()

    const response = await request(core, "/managed-launch/home-toggle", {
      method: "POST",
    })

    expect(await response.json()).toEqual({ status: "unsupported" })
  })

  it("reports unsupported Home lane toggle when the role has no lane capability", async () => {
    const { core } = startHarness()

    const response = await request(core, "/managed-launch/home-toggle", {
      method: "POST",
    })

    expect(await response.json()).toEqual({ status: "unsupported" })
  })

  it("emits SSE heartbeats so a quiet long-running launch keeps the stream alive", async () => {
    // Without heartbeats, an HTTP server's idleTimeout closes the stream
    // and observers misinterpret the close as a launch failure. Heartbeats
    // are emitted as SSE comments (lines starting with `:`), which the
    // parser ignores while keeping the connection alive.
    const control = deferred<LaunchResult>()
    const { core } = startHarness({
      runLaunch: async () => await control.promise,
      heartbeatIntervalMs: 5,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-hb", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-hb",
      authorized(),
    )
    const streamText = streamResponse.text()

    // Let several heartbeat intervals tick before letting the launch finish.
    await new Promise(resolve => setTimeout(resolve, 30))
    control.resolve({ status: "launched" })
    const text = await streamText

    expect(text).toContain(": hb\n\n")
  })

  it("rejects managed launch re-entry while sessiond is not home", async () => {
    const { core, events } = startHarness()

    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({
      status: "failed",
      failureKind: "session-busy",
      message: "sessiond is stopped; launch requires home",
    })
    expect(events).not.toContain("launch-game:/bin/game")
  })

  it("returns bad-request for malformed managed launch payloads", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: { args: [] } }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("bad-request")
  })

  it("cleans up managed-launch event subscribers when the client cancels the stream", async () => {
    const control = deferred<LaunchResult>()
    const { core } = startHarness({
      runLaunch: async () => await control.promise,
      heartbeatIntervalMs: 5,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-cancel-stream", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-cancel-stream",
      authorized(),
    )
    const reader = streamResponse.body?.getReader()
    if (!reader) throw new Error("expected readable SSE body")
    const first = await reader.read()
    expect(first.done).toBe(false)
    await reader.cancel()

    control.resolve({ status: "launched" })
    await waitForSessionMode(core, "home")
  })

  it("accepts managed launch commands and events without HTTP token headers", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", { method: "POST" })

    const commandResponse = await request(core, "/managed-launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ launchId: "launch-1", spec }),
    })
    const eventsResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
    )

    expect(commandResponse.ok).toBe(true)
    expect(eventsResponse.ok).toBe(true)
    expect(events).toContain("launch-renderer")
  })

  it("keeps the blocking launch path compatible while using managed execution", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result).toEqual({ status: "launched" })
    expect(body.state.mode).toBe("home")
  })

  it("rejects managed launches while fake suspend is active", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-fakesuspend-"))
    try {
      const activeMarker = join(dir, "active")
      await writeFile(activeMarker, "active\n")
      const { core, events } = startHarness({
        fakeSuspendActiveMarkerPath: activeMarker,
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      const response = await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ launchId: "launch-while-suspended", spec }),
        }),
      )

      expect(await response.json()).toEqual({
        status: "failed",
        failureKind: "fake-suspend-active",
        message: "fake suspend is active; launch requires resume",
      })
      expect(events).not.toContain("launch-game:/bin/game")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("rejects legacy launches while fake suspend is active", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-fakesuspend-"))
    try {
      const activeMarker = join(dir, "active")
      await writeFile(activeMarker, "active\n")
      const { core, events } = startHarness({
        fakeSuspendActiveMarkerPath: activeMarker,
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      const response = await request(
        core,
        "/launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spec }),
        }),
      )
      const body = await response.json()

      expect(body.result).toEqual({
        status: "failed",
        exitCode: launchFailureExitCode("fake-suspend-active"),
        failureKind: "fake-suspend-active",
        stderrTail: "fake suspend is active; launch requires resume",
      })
      expect(body.state.mode).toBe("home")
      expect(events).not.toContain("launch-game:/bin/game")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("keeps duplicate managed launchIds rejected as busy while the first launch is active", async () => {
    const control = deferred<LaunchResult>()
    const { core } = startHarness({
      runLaunch: async () => await control.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "same-launch", spec }),
      }),
    )
    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "same-launch", spec }),
      }),
    )

    expect(await response.json()).toEqual({
      status: "failed",
      failureKind: "session-busy",
      message: "sessiond is game; launch requires home",
    })
    control.resolve({ status: "launched" })
    await waitForSessionMode(core, "home")
  })

  it("emits child-exited when launcher.spawn returns a failed managed launch result", async () => {
    const core = createKorriSessiondCore({
      logger: silentLogger,
      renderer: {
        kind: "chromium",
        launch: async () => ({ pid: 10, command: { command: "eb", args: [] } }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 10, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async () => ({
          status: "failed",
          result: {
            status: "failed",
            exitCode: 126,
            failureKind: "host-control-disabled",
            stderrTail: "spawn rejected",
          },
        }),
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "spawn-failed", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=spawn-failed",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())
    const childExited = lifecycle.find(event => event.type === "child-exited")

    expect(childExited?.terminal).toMatchObject({
      exitCode: 126,
      failureKind: "host-control-disabled",
      stderrTail: "spawn rejected",
    })
    expect(lifecycle.map(event => event.type)).toContain("home-ready")
  })

  it("maps afterChildRunning failures on the no-spawn launcher path to host-unavailable", async () => {
    const role: SessionRole = {
      id: "no-spawn-role",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {
        throw new Error("no spawned surface")
      },
      idleReadyEvidence: () => "idle-ready",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      role,
      launcher: { run: async () => ({ status: "launched" }) },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "no-spawn-after", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=no-spawn-after",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())
    const childExited = lifecycle.find(event => event.type === "child-exited")

    expect(childExited?.terminal?.failureKind).toBe("host-unavailable")
    expect(childExited?.terminal?.stderrTail).toContain("no spawned surface")
  })

  it("maps beforeChildLaunch failures to host-unavailable and restores idle", async () => {
    const role: SessionRole = {
      id: "before-child-role",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {
        throw new Error("cannot leave idle")
      },
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {},
      idleReadyEvidence: () => "idle-ready",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      role,
      launcher: { run: async () => ({ status: "launched" }) },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "before-child", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=before-child",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())
    const childExited = lifecycle.find(event => event.type === "child-exited")

    expect(childExited?.terminal?.failureKind).toBe("host-unavailable")
    expect(childExited?.terminal?.stderrTail).toContain("cannot leave idle")
    expect(lifecycle.map(event => event.type)).toContain("idle-ready")
  })

  it("records termination requested immediately after managed launch acceptance", async () => {
    const spawnReady = deferred<{
      readonly result: Promise<LaunchResult>
      readonly terminate: () => void
      readonly terminateNow: () => void
    }>()
    const childExit = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => await spawnReady.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    const response = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )

    expect(await response.json()).toEqual({
      status: "accepted",
      launchId: "launch-1",
    })

    spawnReady.resolve({
      result: childExit.promise,
      terminate: () => {
        events.push("terminate-game")
        childExit.resolve({ status: "failed", exitCode: 143 })
      },
      terminateNow: () => {
        events.push("terminate-game-now")
        childExit.resolve({ status: "failed", exitCode: 137 })
      },
    })

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game")
  })

  it("terminates only the active managed launch identity", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => {
          events.push("terminate-game")
          control.resolve({ status: "failed", exitCode: 143 })
        },
        terminateNow: () => {
          events.push("terminate-game-now")
          control.resolve({ status: "failed", exitCode: 137 })
        },
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    const response = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({ status: "accepted", launchId: "launch-1" })
    expect(events).toContain("terminate-game")
    await waitForSessionMode(core, "home")
    expect(events).not.toContain("restore-es")
  })

  it("surfaces active launch metadata in managed status", async () => {
    const child = deferred<LaunchResult>()
    const { core } = startHarness({
      spawnLaunch: async () => ({
        result: child.promise,
        terminate: () => child.resolve({ status: "failed", exitCode: 143 }),
        terminateNow: () => child.resolve({ status: "failed", exitCode: 137 }),
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-1",
          spec,
          launchMetadata: {
            annotations: {
              "@korri:stream": {
                hostId: "aka",
                controlUrl: "http://aka:3001",
              },
            },
          },
        }),
      }),
    )

    const response = await request(core, "/managed-launch/status", authorized())
    const body = await response.json()
    expect(body.active.launchMetadata.annotations["@korri:stream"]).toEqual({
      hostId: "aka",
      controlUrl: "http://aka:3001",
    })

    child.resolve({ status: "failed", exitCode: 143 })
    await waitForSessionMode(core, "home")
  })

  it("freezes and thaws the active managed launch in the standard launch cycle", async () => {
    const child = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: child.promise,
        freeze: () => events.push("freeze-game"),
        thaw: () => events.push("thaw-game"),
        terminate: () => child.resolve({ status: "failed", exitCode: 143 }),
        terminateNow: () => child.resolve({ status: "failed", exitCode: 137 }),
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    const frozen = await request(
      core,
      "/managed-launch/freeze",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )
    expect(await frozen.json()).toEqual({
      status: "accepted",
      launchId: "launch-1",
    })
    expect(events).toContain("freeze-game")

    const frozenStatus = await (
      await request(core, "/managed-launch/status", authorized())
    ).json()
    expect(frozenStatus.capabilities.launchFreeze).toBe(true)
    expect(frozenStatus.active.phase).toBe("frozen")

    const thawed = await request(
      core,
      "/managed-launch/thaw",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )
    expect(await thawed.json()).toEqual({
      status: "accepted",
      launchId: "launch-1",
    })
    expect(events).toContain("thaw-game")

    const thawedStatus = await (
      await request(core, "/managed-launch/status", authorized())
    ).json()
    expect(thawedStatus.active.phase).toBe("running")

    child.resolve({ status: "failed", exitCode: 143 })
    await waitForSessionMode(core, "home")

    const lifecycle = await (
      await request(
        core,
        "/managed-launch/events?launchId=launch-1",
        authorized(),
      )
    ).text()
    expect(parseSseEvents(lifecycle).map(event => event.type)).toContain(
      "child-frozen",
    )
    expect(parseSseEvents(lifecycle).map(event => event.type)).toContain(
      "child-thawed",
    )
  })

  it("thaws a frozen managed launch before terminating it", async () => {
    const child = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: child.promise,
        freeze: () => events.push("freeze-game"),
        thaw: () => events.push("thaw-game"),
        terminate: () => {
          events.push("terminate-game")
          child.resolve({ status: "failed", exitCode: 143 })
        },
        terminateNow: () => {
          events.push("terminate-game-now")
          child.resolve({ status: "failed", exitCode: 137 })
        },
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    await request(
      core,
      "/managed-launch/freeze",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )

    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )

    await waitForSessionMode(core, "home")
    expect(events).toEqual(
      expect.arrayContaining(["freeze-game", "thaw-game", "terminate-game"]),
    )
    expect(events.indexOf("thaw-game")).toBeLessThan(
      events.indexOf("terminate-game"),
    )
  })

  it("force terminates an accepted managed launch when requested before child registration", async () => {
    const spawnReady = deferred<{
      readonly result: Promise<LaunchResult>
      readonly terminate: () => void
      readonly terminateNow: () => void
    }>()
    const childExit = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => await spawnReady.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", force: true }),
      }),
    )

    spawnReady.resolve({
      result: childExit.promise,
      terminate: () => {
        events.push("terminate-game")
        childExit.resolve({ status: "failed", exitCode: 143 })
      },
      terminateNow: () => {
        events.push("terminate-game-now")
        childExit.resolve({ status: "failed", exitCode: 137 })
      },
    })

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game-now")
    expect(events).not.toContain("terminate-game")
  })

  it("escalates a managed launch when graceful termination does not exit", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      managedStopGraceMs: 0,
      spawnLaunch: async () => ({
        result: control.promise,
        processGroupId: 584400,
        terminate: () => {
          events.push("terminate-game")
        },
        terminateNow: () => {
          events.push("terminate-game-now")
          control.resolve({ status: "failed", exitCode: 137 })
        },
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "managed-launch",
          spec,
        }),
      }),
    )

    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "managed-launch" }),
      }),
    )

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game")
    expect(events).toContain("terminate-game-now")
  })

  it("runs Steam plugin cleanup before returning home", async () => {
    const control = deferred<LaunchResult>()
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = []
    let scan = 0
    const thirtyXxRoot: SteamForegroundProcessInfo = {
      pid: 420,
      uid: 1000,
      cmdline: [
        "/var/lib/korri/steam/steamrtarm64/cleanup",
        "SteamLaunch",
        "AppId=1029210",
      ],
    }
    const caveblazersRoot: SteamForegroundProcessInfo = {
      pid: 421,
      uid: 1000,
      cmdline: [
        "/var/lib/korri/steam/steamrtarm64/cleanup",
        "SteamLaunch",
        "AppId=452060",
      ],
    }
    const warmSteam: SteamForegroundProcessInfo = {
      pid: 422,
      uid: 1000,
      cmdline: ["/var/lib/korri/steam/steamrtarm64/steam", "-silent"],
    }
    const thirtyXxExe: SteamForegroundProcessInfo = {
      pid: 423,
      ppid: 420,
      uid: 1000,
      cmdline: [
        "/usr/bin/FEX",
        "/var/lib/korri/steam/steamapps/common/30XX/30XX.exe",
      ],
    }
    const proton: SteamForegroundProcessInfo = {
      pid: 424,
      ppid: 420,
      uid: 1000,
      cmdline: [
        "/var/lib/korri/steam/steamapps/common/Proton - Experimental/proton",
        "waitforexitandrun",
      ],
    }
    const fex: SteamForegroundProcessInfo = {
      pid: 425,
      ppid: 424,
      uid: 1000,
      cmdline: [
        "/usr/bin/FEXInterpreter",
        "/var/lib/korri/steam/steamapps/common/30XX/30XX.exe",
      ],
    }
    const pressureVessel: SteamForegroundProcessInfo = {
      pid: 426,
      ppid: 424,
      uid: 1000,
      cmdline: [
        "/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pv-bwrap",
      ],
    }
    const thirtyXxProcesses = [
      thirtyXxRoot,
      thirtyXxExe,
      proton,
      fex,
      pressureVessel,
    ]
    const { core } = startHarness({
      managedStopGraceMs: 0,
      sessionHooks: [
        createSteamSessionLifecycleHook({
          graceMs: 0,
          processScanner: async () => {
            scan += 1
            if (scan <= 2)
              return [...thirtyXxProcesses, caveblazersRoot, warmSteam]
            return [caveblazersRoot, warmSteam]
          },
          signalProcess: (pid, signal) => signals.push({ pid, signal }),
        }),
      ],
      spawnLaunch: async () => ({
        result: control.promise,
        processGroupId: 584400,
        terminate: () => undefined,
        terminateNow: () =>
          control.resolve({ status: "failed", exitCode: 137 }),
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    const start = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "thirty-xx-steam-launch",
          spec,
          launchMetadata: steamLaunchMetadata("1029210"),
        }),
      }),
    )
    expect(await start.json()).toEqual({
      status: "accepted",
      launchId: "thirty-xx-steam-launch",
    })

    const terminated = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "thirty-xx-steam-launch" }),
      }),
    )
    expect(await terminated.json()).toEqual({
      status: "accepted",
      launchId: "thirty-xx-steam-launch",
    })

    await waitForSessionMode(core, "home")
    expect(signals).toEqual([
      { pid: 420, signal: "SIGTERM" },
      { pid: 423, signal: "SIGTERM" },
      { pid: 424, signal: "SIGTERM" },
      { pid: 425, signal: "SIGTERM" },
      { pid: 426, signal: "SIGTERM" },
      { pid: 420, signal: "SIGKILL" },
      { pid: 423, signal: "SIGKILL" },
      { pid: 424, signal: "SIGKILL" },
      { pid: 425, signal: "SIGKILL" },
      { pid: 426, signal: "SIGKILL" },
    ])
  })

  it("force terminates the active managed launch identity", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => {
          events.push("terminate-game")
          control.resolve({ status: "failed", exitCode: 143 })
        },
        terminateNow: () => {
          events.push("terminate-game-now")
          control.resolve({ status: "failed", exitCode: 137 })
        },
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", force: true }),
      }),
    )

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game-now")
    expect(events).not.toContain("terminate-game")
  })

  it("does not stop the kiosk for stale managed launch termination", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "stale-launch" }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({
      status: "not-found",
      launchId: "stale-launch",
      message: "managed launch is not active",
    })
    expect(core.status().state.mode).toBe("home")
    expect(events).not.toContain("restore-es")
  })

  it("retries a transient renderer restore failure and returns home", async () => {
    const { core, events } = startHarness({ rendererRestoreFailures: 1 })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    const stream = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
      authorized(),
    )
    const lifecycle = parseSseEvents(await stream.text())

    expect(core.status().state.mode).toBe("home")
    expect(core.status().state.restoreAttempts).toBe(0)
    expect(events.filter(event => event === "launch-renderer")).toHaveLength(3)
    expect(lifecycle.map(event => event.type)).toContain("home-ready")
    expect(lifecycle.map(event => event.type)).not.toContain("recovering")
  })

  it("emits recovering without home-ready when managed restore exhausts retries", async () => {
    const { core, events } = startHarness({ failRendererRestore: true })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    const stream = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
      authorized(),
    )
    const lifecycle = parseSseEvents(await stream.text())

    expect(events.filter(event => event === "launch-renderer")).toHaveLength(
      MAX_RESTORE_ATTEMPTS + 1,
    )
    expect(lifecycle.map(event => event.type)).toContain("recovering")
    expect(lifecycle.map(event => event.type)).not.toContain("home-ready")
  })

  it("returns a bounded failed event for stale lifecycle replay requests", async () => {
    const { core } = startHarness()

    const response = await request(
      core,
      "/managed-launch/events?launchId=missing-launch",
      authorized(),
    )
    const lifecycle = parseSseEvents(await response.text())

    expect(lifecycle).toMatchObject([
      {
        launchId: "missing-launch",
        type: "failed",
        message: "managed launch event replay unavailable",
      },
    ])
  })

  // Task-039 HTTP-surface coverage: these are public daemon
  // branches that are intentionally reachable without internal
  // helper imports.
  it("serves unauthenticated GET /status as the health/status read path", async () => {
    const { core } = startHarness()

    const response = await request(core, "/status")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.state.mode).toBe("stopped")
    expect(body.renderer.kind).toBe("chromium")
  })

  it("runs /control/reconcile through the role's public reconcile hook", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/control/reconcile",
      authorized({ method: "POST" }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.state.mode).toBe("home")
  })

  it("returns 404 for unknown authenticated daemon routes", async () => {
    const { core } = startHarness()

    const response = await request(core, "/not-a-sessiond-route", authorized())

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("not found")
  })

  it("returns HTTP 500 and logs when a public daemon command throws", async () => {
    const warnings: unknown[] = []
    const role: SessionRole = {
      id: "boom-role",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {
        throw new Error("enter idle exploded")
      },
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {},
      idleReadyEvidence: () => "idle",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      role,
      launcher: { run: async () => ({ status: "launched" }) },
      logger: { ...silentLogger, warn: input => warnings.push(input) },
    })

    const response = await request(
      core,
      "/control/start",
      authorized({ method: "POST" }),
    )

    expect(response.status).toBe(500)
    expect(await response.text()).toBe("enter idle exploded")
    expect(warnings).toHaveLength(1)
  })

  it("stops Korri mode by stopping Chromium and restoring ES", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/control/stop",
      authorized({ method: "POST" }),
    )
    const body = await response.json()

    expect(body.state.mode).toBe("stopped")
    expect(events).toContain("restore-es")
    expect(events).toContain("stop-renderer:101")
  })

  it("invokes the cleanup with the launch processGroupId at the restoring transition", async () => {
    const cleanupCalls: KorriSessiondLifecycleHookCleanupRequest[] = []
    const cleanup: NonNullable<
      KorriSessiondLifecycleHook["cleanup"]
    > = async request => {
      cleanupCalls.push(request)
      const outcome: KorriSessiondLifecycleHookCleanupResult = {
        cleaned: [],
        residual: [],
      }
      return outcome
    }
    const control = deferred<LaunchResult>()
    const { core } = startHarness({
      sessionHooks: [cleanupHook(cleanup)],
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => control.resolve({ status: "launched" }),
        terminateNow: () => control.resolve({ status: "launched" }),
        processGroupId: 99001,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-cleanup", spec }),
      }),
    )

    control.resolve({ status: "launched" })
    await waitForSessionMode(core, "home")

    expect(cleanupCalls).toEqual([
      { launchId: "launch-cleanup", processGroupId: 99001 },
    ])

    const stream = await request(
      core,
      "/managed-launch/events?launchId=launch-cleanup",
      authorized(),
    )
    const lifecycle = parseSseEvents(await stream.text())
    const types = lifecycle.map(event => event.type)
    // child-exited must precede restoring; cleanup runs during restoring,
    // home-ready terminal readiness must be last.
    const childExited = types.indexOf("child-exited")
    const restoring = types.indexOf("restoring")
    const homeReady = types.indexOf("home-ready")
    expect(childExited).toBeLessThan(restoring)
    expect(restoring).toBeLessThan(homeReady)
  })

  it("blocks idle restore when Remap reports dirty cleanup", async () => {
    const control = deferred<LaunchResult>()
    const launchCompanions = {
      "@korri:remap": { bindings: { "p1.button.south": "key.a" } },
    }
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => control.resolve({ status: "launched" }),
        terminateNow: () => control.resolve({ status: "launched" }),
        processGroupId: 120120,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "remap-dirty-cleanup",
          spec,
          launchCompanions,
        }),
      }),
    )
    const stream = await request(
      core,
      "/managed-launch/events?launchId=remap-dirty-cleanup",
      authorized(),
    )
    const streamText = stream.text()

    control.resolve({
      status: "failed",
      exitCode: 120,
      stderrTail: "korri-remap-native-driver: cleanup verification failed",
    })
    const lifecycle = parseSseEvents(await streamText)

    expect(lifecycle.map(event => event.type)).toContain("recovering")
    expect(lifecycle.map(event => event.type)).not.toContain("home-ready")
    expect(events.filter(event => event === "launch-renderer")).toHaveLength(1)
  })

  it("passes launch companions into lifecycle hook start and cleanup", async () => {
    const startCalls: KorriSessiondLifecycleHookStartRequest[] = []
    const cleanupCalls: KorriSessiondLifecycleHookCleanupRequest[] = []
    const control = deferred<LaunchResult>()
    const launchCompanions = {
      "@fixture:companion": { enable: true, mode: "wrapped" },
    }
    const { core } = startHarness({
      sessionHooks: [
        afterChildHook(async request => {
          startCalls.push(request)
          return { label: "fixture" }
        }),
        cleanupHook(async request => {
          cleanupCalls.push(request)
          return { cleaned: [], residual: [] }
        }),
      ],
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => control.resolve({ status: "launched" }),
        terminateNow: () => control.resolve({ status: "launched" }),
        processGroupId: 99002,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-companions",
          spec,
          launchCompanions,
        }),
      }),
    )

    control.resolve({ status: "launched" })
    await waitForSessionMode(core, "home")

    expect(startCalls).toMatchObject([
      { launchId: "launch-companions", spec, launchCompanions },
    ])
    expect(cleanupCalls).toMatchObject([
      {
        launchId: "launch-companions",
        processGroupId: 99002,
        launchCompanions,
      },
    ])
  })

  it("logs residual pids reported by the cleanup without blocking restore", async () => {
    const warnings: unknown[] = []
    const cleanup: NonNullable<
      KorriSessiondLifecycleHook["cleanup"]
    > = async () => ({
      cleaned: [1234],
      residual: [9999],
    })
    const control = deferred<LaunchResult>()
    const { core } = startHarness({
      sessionHooks: [cleanupHook(cleanup)],
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => control.resolve({ status: "launched" }),
        terminateNow: () => control.resolve({ status: "launched" }),
        processGroupId: 55,
      }),
    })
    // Replace logger by constructing directly so this test can assert
    // the warning payload produced by the public restore path.
    const warningCore = createKorriSessiondCore({
      logger: { ...silentLogger, warn: input => warnings.push(input) },
      sessionHooks: [cleanupHook(cleanup)],
      renderer: {
        kind: "chromium",
        launch: async () => ({ pid: 10, command: { command: "eb", args: [] } }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 10, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async () => ({
          status: "started" as const,
          result: control.promise,
          session: {
            id: "child",
            processGroupId: 55,
            exited: control.promise.then(() => ({ exitCode: 0 })),
            terminate: () => control.resolve({ status: "launched" }),
            terminateNow: () => control.resolve({ status: "launched" }),
          },
        }),
      },
    })
    await request(warningCore, "/control/start", authorized({ method: "POST" }))
    await request(
      warningCore,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "cleanup-residual", spec }),
      }),
    )

    control.resolve({ status: "launched" })
    await waitForSessionMode(warningCore, "home")

    expect(warnings).toContainEqual(
      expect.objectContaining({ processGroupId: 55, residualPids: [9999] }),
    )
    expect(warningCore.status().state.mode).toBe("home")
    // Keep the original harness referenced so the local helper remains
    // covered by this test's branch shape.
    expect(core.status().state.mode).toBe("stopped")
  })

  it("logs and ignores cleanup exceptions during restore", async () => {
    const warnings: unknown[] = []
    const control = deferred<LaunchResult>()
    const warningCore = createKorriSessiondCore({
      logger: { ...silentLogger, warn: input => warnings.push(input) },
      sessionHooks: [
        cleanupHook(async () => {
          throw new Error("procfs unavailable")
        }),
      ],
      renderer: {
        kind: "chromium",
        launch: async () => ({ pid: 10, command: { command: "eb", args: [] } }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 10, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async () => ({
          status: "started" as const,
          result: control.promise,
          session: {
            id: "child",
            processGroupId: 56,
            exited: control.promise.then(() => ({ exitCode: 0 })),
            terminate: () => control.resolve({ status: "launched" }),
            terminateNow: () => control.resolve({ status: "launched" }),
          },
        }),
      },
    })
    await request(warningCore, "/control/start", authorized({ method: "POST" }))
    await request(
      warningCore,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "cleanup-throw", spec }),
      }),
    )

    control.resolve({ status: "launched" })
    await waitForSessionMode(warningCore, "home")

    expect(warnings.some(input => hasKey(input, "err"))).toBe(true)
    expect(warningCore.status().state.mode).toBe("home")
  })

  it("invokes cleanup with an undefined process group when the active launch has no process group", async () => {
    const cleanupCalls: KorriSessiondLifecycleHookCleanupRequest[] = []
    const cleanup: NonNullable<
      KorriSessiondLifecycleHook["cleanup"]
    > = async request => {
      cleanupCalls.push(request)
      return { cleaned: [], residual: [] }
    }
    const { core } = startHarness({
      sessionHooks: [cleanupHook(cleanup)],
      // runLaunch provides no processGroupId; this branch uses launcher.run
      // path which lacks a session handle entirely.
      launchResult: { status: "launched" },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    expect(cleanupCalls).toEqual([
      { launchId: expect.any(String), processGroupId: undefined },
    ])
  })

  it("writes status sidecar snapshots on every kiosk lifecycle transition", async () => {
    const snapshots: SessiondLifecycleSnapshot[] = []
    const sidecar: StatusSidecar = {
      write: async snapshot => {
        snapshots.push(snapshot)
      },
    }
    const injectedCore = createKorriSessiondCore({
      logger: silentLogger,
      statusSidecar: sidecar,
      launcher: { run: async () => ({ status: "launched" }) },
      renderer: {
        kind: "chromium",
        launch: async () => ({
          pid: 200,
          command: { command: "chromium", args: [] },
        }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 200, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
    })

    await injectedCore.handleRequest(
      new Request("http://127.0.0.1:3003/control/start", {
        method: "POST",
      }),
    )

    const modes = snapshots.map(s => s.mode)
    expect(modes).toContain("starting")
    expect(modes).toContain("home")
  })

  it("translates state.mode='home' to the role's idleModeLabel in managed status", async () => {
    const role: SessionRole = {
      id: "source-machine",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {},
      idleReadyEvidence: () => "idle-blank",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      role,
      launcher: { run: async () => ({ status: "launched" }) },
    })

    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(core, "/managed-launch/status", authorized())
    const body = await response.json()

    expect(body.mode).toBe("idle")
    expect(core.status().state.mode).toBe("home")
  })

  it("delegates idle target to injected SessionRole and emits the role's terminal readiness event", async () => {
    const calls: string[] = []
    const role: SessionRole = {
      id: "source-machine",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {
        calls.push("enterIdle")
      },
      leaveIdle: async () => {
        calls.push("leaveIdle")
      },
      beforeChildLaunch: async () => {
        calls.push("beforeChildLaunch")
      },
      restoreIdleAfterLaunch: async () => {
        calls.push("restoreIdleAfterLaunch")
      },
      afterChildRunning: async () => {},
      reconcileIdle: async () => {
        calls.push("reconcileIdle")
      },
      idleReadyEvidence: () => "idle-blank-satisfied",
      rendererStatus: () => ({ kind: "noop" }),
    }

    const core = createKorriSessiondCore({
      logger: silentLogger,
      role,
      launcher: { run: async () => ({ status: "launched" }) },
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    expect(calls).toContain("enterIdle")
    expect(core.status().state.mode).toBe("home")
    expect(core.status().renderer).toEqual({ kind: "noop" })

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-role", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-role",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())
    const types = lifecycle.map(event => event.type)

    expect(types).toContain("idle-ready")
    expect(types).not.toContain("renderer-stopped")
    expect(types).not.toContain("home-ready")
    const idleReady = lifecycle.find(event => event.type === "idle-ready")
    expect(idleReady?.readiness).toEqual({
      status: "ok",
      evidence: "idle-blank-satisfied",
    })
    expect(calls).toContain("beforeChildLaunch")
    expect(calls).toContain("restoreIdleAfterLaunch")
  })

  it("runs pre-spawn gates after role preparation and before child spawn", async () => {
    const order: string[] = []
    const child = deferred<LaunchResult>()
    const role: SessionRole = {
      id: "pre-spawn-role",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      rendererStatus: () => ({ kind: "none" }),
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {
        order.push("before-child")
      },
      afterChildRunning: async () => {
        order.push("after-child")
      },
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      idleReadyEvidence: () => "idle-ready",
    }
    const { core } = startHarness({
      role,
      preSpawnGates: [
        {
          id: "test-pre-spawn",
          start: async () => {
            order.push("pre-spawn")
          },
        },
      ],
      spawnLaunch: async () => {
        order.push("spawn")
        return {
          result: child.promise,
          terminate: () => child.resolve({ status: "launched" }),
          terminateNow: () =>
            child.resolve({ status: "failed", exitCode: 143 }),
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const launch = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "pre-spawn-order", spec }),
      }),
    )
    expect(await launch.json()).toEqual({
      status: "accepted",
      launchId: "pre-spawn-order",
    })

    await new Promise(resolve => setTimeout(resolve, 5))
    expect(order).toEqual(["before-child", "pre-spawn", "spawn", "after-child"])
    child.resolve({ status: "launched" })
  })

  it("does not leak pre-spawn source environment into the spawned child spec", async () => {
    let spawnedSpec: LaunchSpec | undefined
    const child = deferred<LaunchResult>()
    const { core } = startHarness({
      preSpawnGates: [
        {
          id: "test-pre-spawn-env",
          start: async () => ({
            sourceEnv: {
              KORRI_INPUT_SEAT_MIRROR_SOCKET: "/tmp/korri-seat.sock",
              KORRI_INPUT_SEAT_LAUNCH_ID: "launch-env",
            },
            stop: () => {},
          }),
        },
      ],
      spawnLaunch: async receivedSpec => {
        spawnedSpec = receivedSpec
        return {
          result: child.promise,
          terminate: () => child.resolve({ status: "launched" }),
          terminateNow: () =>
            child.resolve({ status: "failed", exitCode: 143 }),
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-env",
          spec: { ...spec, env: { EXISTING: "1" } },
        }),
      }),
    )

    await new Promise(resolve => setTimeout(resolve, 5))
    expect(spawnedSpec?.env).toEqual({ EXISTING: "1" })
    child.resolve({ status: "launched" })
  })

  it("fails before spawn with the pre-spawn gate failure kind", async () => {
    const order: string[] = []
    const { core } = startHarness({
      preSpawnGates: [
        {
          id: "test-pre-spawn",
          start: async () => {
            order.push("pre-spawn")
            throw new KorriSessiondPreSpawnFailure(
              "input seats unavailable",
              "input-unavailable",
            )
          },
        },
      ],
      spawnLaunch: async () => {
        order.push("spawn")
        return {
          result: Promise.resolve({ status: "launched" }),
          terminate: () => {},
          terminateNow: () => {},
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "pre-spawn-failed", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=pre-spawn-failed",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())

    expect(order).toEqual(["pre-spawn"])
    expect(
      lifecycle.find(event => event.type === "child-exited")?.terminal,
    ).toMatchObject({
      exitCode: 123,
      failureKind: "input-unavailable",
      stderrTail: "input seats unavailable",
    })
  })

  it("surfaces allocated input-seat summary through managed launch status", async () => {
    const child = deferred<LaunchResult>()
    const { core } = startHarness({
      preSpawnGates: [
        {
          id: "@korri:input-seat",
          start: async () => ({
            inputSeats: {
              seats: [
                {
                  slot: 1,
                  playerIndex: 1,
                  name: "Korri Seat P1",
                  state: "available",
                },
              ],
            },
            stop: () => {},
          }),
        },
      ],
      spawnLaunch: async () => ({
        result: child.promise,
        terminate: () => child.resolve({ status: "launched" }),
        terminateNow: () => child.resolve({ status: "failed", exitCode: 143 }),
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "input-seat-status", spec }),
      }),
    )

    await new Promise(resolve => setTimeout(resolve, 5))
    const statusResponse = await request(
      core,
      "/managed-launch/status",
      authorized(),
    )
    const status = await statusResponse.json()

    expect(status.capabilities.inputSeats).toBe(true)
    expect(status.active.inputSeats).toEqual({
      seats: [
        {
          slot: 1,
          playerIndex: 1,
          name: "Korri Seat P1",
          state: "available",
        },
      ],
    })

    child.resolve({ status: "launched" })
  })

  it("releases an input seat through launch-scoped managed leave", async () => {
    const child = deferred<LaunchResult>()
    const leftSlots: number[] = []
    const { core } = startHarness({
      preSpawnGates: [
        {
          id: "@korri:input-seat",
          start: async () => ({
            inputSeats: {
              seats: [
                {
                  slot: 1,
                  playerIndex: 1,
                  name: "Korri Seat P1",
                  state: "occupied-connected",
                  sourceKey: "source:redacted",
                },
              ],
            },
            leaveInputSeat: slot => leftSlots.push(slot),
            stop: () => {},
          }),
        },
      ],
      spawnLaunch: async () => ({
        result: child.promise,
        terminate: () => child.resolve({ status: "launched" }),
        terminateNow: () => child.resolve({ status: "failed", exitCode: 143 }),
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "input-seat-leave", spec }),
      }),
    )
    await new Promise(resolve => setTimeout(resolve, 5))

    const leave = await request(
      core,
      "/managed-launch/input-seat/leave",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "input-seat-leave",
          slot: 1,
          sourceKey: "source:redacted",
        }),
      }),
    )
    expect(await leave.json()).toEqual({
      status: "released",
      launchId: "input-seat-leave",
      slot: 1,
    })
    expect(leftSlots).toEqual([1])

    const status = await (
      await request(core, "/managed-launch/status", authorized())
    ).json()
    expect(status.active.inputSeats.seats[0]).toEqual({
      slot: 1,
      playerIndex: 1,
      name: "Korri Seat P1",
      state: "available",
      reason: "explicit-leave",
    })

    child.resolve({ status: "launched" })
    await waitForSessionMode(core, "home")

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=input-seat-leave",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())
    expect(lifecycle.map(event => event.type)).toContain("seat-left")
    expect(lifecycle.map(event => event.type)).toContain("seat-released")
  })

  it("aborts a blocking pre-spawn gate on force terminate", async () => {
    const aborted = deferred<void>()
    const { core } = startHarness({
      preSpawnGates: [
        {
          id: "test-pre-spawn",
          start: async request => {
            await new Promise<void>(resolve => {
              request.signal.addEventListener(
                "abort",
                () => {
                  aborted.resolve()
                  resolve()
                },
                { once: true },
              )
            })
            throw new KorriSessiondPreSpawnFailure(
              "cancelled",
              "input-unavailable",
            )
          },
        },
      ],
      spawnLaunch: async () => ({
        result: Promise.resolve({ status: "launched" }),
        terminate: () => {},
        terminateNow: () => {},
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "pre-spawn-abort", spec }),
      }),
    )
    const stop = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "pre-spawn-abort", force: true }),
      }),
    )

    expect(await stop.json()).toMatchObject({ status: "accepted" })
    await aborted.promise
  })

  it("fails launch as host-unavailable when session lifecycle hook start fails", async () => {
    const order: string[] = []
    const terminated: string[] = []
    const { core } = startHarness({
      spawnLaunch: async () => ({
        processGroupId: 42,
        result: Promise.resolve({ status: "launched" }),
        terminate: () => {
          terminated.push("graceful")
        },
        terminateNow: () => undefined,
      }),
      sessionHooks: [
        afterChildHook(async () => {
          order.push("hook-start")
          throw new Error("hook missing")
        }),
      ],
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-hook-fail", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-hook-fail",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())

    expect(order).toEqual(["hook-start"])
    expect(terminated).toEqual(["graceful"])
    expect(lifecycle.map(event => event.type)).toContain("child-running")
    expect(
      lifecycle.find(event => event.type === "child-exited")?.terminal,
    ).toMatchObject({
      exitCode: 124,
      failureKind: "host-unavailable",
      stderrTail: "Session lifecycle hook failed: hook missing",
    })
  })

  it("continues cleanup when a session lifecycle hook handle stop throws", async () => {
    const child = deferred<LaunchResult>()
    const order: string[] = []
    const { core } = startHarness({
      spawnLaunch: async () => ({
        processGroupId: 42,
        result: child.promise,
        terminate: () => undefined,
        terminateNow: () => undefined,
      }),
      sessionHooks: [
        afterChildHook(async () => ({
          resource: "test-control.sock",
          stopBeforeCleanup: async () => {
            order.push("hook-stop")
            throw new Error("stop failed")
          },
        })),
        cleanupHook(async () => {
          order.push("cleanup")
          return { cleaned: [], residual: [] }
        }),
      ],
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-hook-stop-fail", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-hook-stop-fail",
      authorized(),
    )
    const streamText = streamResponse.text()

    child.resolve({ status: "launched" })
    await streamText

    expect(order).toEqual(["hook-stop", "cleanup"])
  })

  it("starts a session lifecycle hook after child spawn and stops it before cleanup", async () => {
    const child = deferred<LaunchResult>()
    const order: string[] = []
    const { core } = startHarness({
      spawnLaunch: async () => {
        order.push("child-spawned")
        return {
          processGroupId: 42,
          result: child.promise,
          terminate: () => undefined,
          terminateNow: () => undefined,
        }
      },
      sessionHooks: [
        afterChildHook(async () => {
          order.push("hook-start")
          return {
            resource: "test-control.sock",
            stopBeforeCleanup: async () => {
              order.push("hook-stop")
            },
          }
        }),
        cleanupHook(async () => {
          order.push("cleanup")
          return { cleaned: [], residual: [] }
        }),
      ],
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-hook", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-hook",
      authorized(),
    )
    const streamText = streamResponse.text()

    await new Promise(resolve => setTimeout(resolve, 5))
    expect(order).toEqual(["child-spawned", "hook-start"])

    child.resolve({ status: "launched" })
    await streamText

    expect(order).toEqual([
      "child-spawned",
      "hook-start",
      "hook-stop",
      "cleanup",
    ])
  })

  // Phase 4D / Track A U4 -- session-lifecycle dispatch.

  it("advertises sessionLifecycle in managed-launch capabilities", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))
    const response = await request(core, "/managed-launch/status", authorized())
    const body = await response.json()
    expect(body.capabilities.sessionLifecycle).toBe(true)
  })

  it("emits launcher-exited + wait-monitor lifecycle for session+wait launches", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/steam-wait-monitor.sh",
      args: ["--pid-tree"],
    }
    const { core } = startHarness({
      spawnLaunch: async receivedSpec => ({
        result:
          receivedSpec.command === waitSpec.command
            ? waitCtrl.promise
            : launcherCtrl.promise,
        terminate: () => {},
        terminateNow: () => {},
        processGroupId: receivedSpec.command === waitSpec.command ? 4242 : 1212,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const start = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-w",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    expect(await start.json()).toEqual({
      status: "accepted",
      launchId: "launch-w",
    })

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-w",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 5))
    waitCtrl.resolve({ status: "launched" })

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "wait-monitor-running",
      "wait-monitor-exited",
      "restoring",
      "home-ready",
    ])
  })

  it("anchors session+no-wait launches and resumes restoring after external terminate", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const { core } = startHarness({
      spawnLaunch: async () => ({
        result: launcherCtrl.promise,
        terminate: () => {},
        terminateNow: () => {},
        processGroupId: 1212,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-a",
          spec,
          lifecycle: "session",
        }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-a",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    // Give sessiond time to emit launcher-exited + session-anchored before
    // we issue the terminate request.
    await new Promise(resolve => setTimeout(resolve, 10))
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-a" }),
      }),
    )

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "session-anchored",
      "terminated",
      "restoring",
      "home-ready",
    ])
    const anchored = lifecycle.find(e => e.type === "session-anchored")
    expect(anchored?.readiness?.status).toBe("ok")
    expect(anchored?.readiness?.evidence).toContain("anchor holding")
  })

  it("runs session+wait through launcher.run when spawn capability is absent", async () => {
    const seenCommands: string[] = []
    const waitSpec: LaunchSpec = {
      command: "/bin/blocking-wait-monitor.sh",
      args: ["--pid-tree"],
    }
    const { core } = startHarness({
      runLaunch: async receivedSpec => {
        seenCommands.push(receivedSpec.command)
        return { status: "launched" }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-run-wait",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-run-wait",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())

    expect(seenCommands).toEqual([spec.command, waitSpec.command])
    expect(lifecycle.map(event => event.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "wait-monitor-running",
      "wait-monitor-exited",
      "restoring",
      "home-ready",
    ])
  })

  it("degrades session+wait to anchor when wait monitor spawn returns failed", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/steam-wait-monitor.sh",
      args: [],
    }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      renderer: {
        kind: "chromium",
        launch: async () => ({ pid: 10, command: { command: "eb", args: [] } }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 10, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async receivedSpec => {
          if (receivedSpec.command === waitSpec.command) {
            return {
              status: "failed" as const,
              result: {
                status: "failed" as const,
                exitCode: 126,
                failureKind: "host-control-disabled" as const,
                stderrTail: "wait unavailable",
              },
            }
          }
          return {
            status: "started" as const,
            result: launcherCtrl.promise,
            session: {
              id: "launcher-child",
              processGroupId: 1212,
              exited: launcherCtrl.promise.then(() => ({ exitCode: 0 })),
              terminate: () => {},
              terminateNow: () => {},
            },
          }
        },
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-wait-failed",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-wait-failed",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 10))
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-wait-failed" }),
      }),
    )

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(event => event.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "session-anchored",
      "terminated",
      "restoring",
      "home-ready",
    ])
  })

  it("applies queued terminate requests to the wait monitor once it registers", async () => {
    const runCase = async (force: boolean) => {
      const events: string[] = []
      const launcherCtrl = deferred<LaunchResult>()
      const waitStarted = deferred<void>()
      const waitSpawnReady = deferred<{
        readonly result: Promise<LaunchResult>
        readonly terminate: () => void
        readonly terminateNow: () => void
      }>()
      const waitCtrl = deferred<LaunchResult>()
      const waitSpec: LaunchSpec = { command: `/bin/wait-${force}`, args: [] }
      const { core } = startHarness({
        spawnLaunch: async receivedSpec => {
          if (receivedSpec.command === waitSpec.command) {
            waitStarted.resolve()
            return await waitSpawnReady.promise
          }
          return {
            result: launcherCtrl.promise,
            terminate: () => events.push("terminate-launcher"),
            terminateNow: () => events.push("terminate-launcher-now"),
            processGroupId: 1212,
          }
        },
      })
      await request(core, "/control/start", authorized({ method: "POST" }))
      await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: `launch-wait-cancel-${force}`,
            spec,
            lifecycle: "session",
            wait: waitSpec,
          }),
        }),
      )
      const streamResponse = await request(
        core,
        `/managed-launch/events?launchId=launch-wait-cancel-${force}`,
        authorized(),
      )
      const streamText = streamResponse.text()

      launcherCtrl.resolve({ status: "launched" })
      await waitStarted.promise
      await request(
        core,
        "/managed-launch/terminate",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: `launch-wait-cancel-${force}`,
            force,
          }),
        }),
      )
      waitSpawnReady.resolve({
        result: waitCtrl.promise,
        terminate: () => {
          events.push("terminate-wait")
          waitCtrl.resolve({ status: "failed", exitCode: 143 })
        },
        terminateNow: () => {
          events.push("terminate-wait-now")
          waitCtrl.resolve({ status: "failed", exitCode: 137 })
        },
      })

      await streamText
      return events
    }

    expect(await runCase(false)).toContain("terminate-wait")
    expect(await runCase(true)).toContain("terminate-wait-now")
  })

  it("degrades session+wait to anchor when wait monitor spawn throws", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/steam-wait-monitor.sh",
      args: [],
    }
    const { core } = startHarness({
      spawnLaunch: async receivedSpec => {
        if (receivedSpec.command === waitSpec.command) {
          throw new Error("wait monitor spawn failed")
        }
        return {
          result: launcherCtrl.promise,
          terminate: () => {},
          terminateNow: () => {},
          processGroupId: 1212,
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-d",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-d",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 10))
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-d" }),
      }),
    )

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "session-anchored",
      "terminated",
      "restoring",
      "home-ready",
    ])
  })

  it("falls through to child-exited when session launcher exits non-zero", async () => {
    // Graceful degradation: under lifecycle: "session", a non-zero launcher
    // exit must NOT emit launcher-exited / wait-monitor / anchored. It
    // routes to the standard child-exited terminal path.
    const launcherCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/wait",
      args: [],
    }
    let waitSpawnCalls = 0
    const { core } = startHarness({
      spawnLaunch: async receivedSpec => {
        if (receivedSpec.command === waitSpec.command) {
          waitSpawnCalls += 1
        }
        return {
          result: launcherCtrl.promise,
          terminate: () => {},
          terminateNow: () => {},
          processGroupId: 1212,
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-f",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-f",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({
      status: "failed",
      exitCode: 2,
      failureKind: "command-failed",
      stderrTail: "boom",
    })

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "child-exited",
      "restoring",
      "home-ready",
    ])
    expect(waitSpawnCalls).toBe(0)
    expect(
      lifecycle.find(e => e.type === "child-exited")?.terminal?.exitCode,
    ).toBe(2)
  })

  it("emits session sub-phase to the status sidecar across a session+wait lifecycle", async () => {
    const snapshots: SessiondLifecycleSnapshot[] = []
    const sidecar: StatusSidecar = {
      write: async snapshot => {
        snapshots.push(snapshot)
      },
    }
    const launcherCtrl = deferred<LaunchResult>()
    const waitCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = { command: "/bin/wait", args: [] }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      statusSidecar: sidecar,
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      renderer: {
        kind: "chromium",
        launch: async () => ({
          pid: 200,
          command: { command: "chromium", args: [] },
        }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 200, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async receivedSpec => ({
          status: "started" as const,
          result:
            receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise,
          session: {
            id: "child",
            processGroupId:
              receivedSpec.command === waitSpec.command ? 4242 : 1212,
            exited: (receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise
            ).then(r => ({
              exitCode: r.status === "launched" ? 0 : r.exitCode,
            })),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
      },
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    snapshots.length = 0
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "phase-1",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=phase-1",
      authorized(),
    )
    const streamText = streamResponse.text()
    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 5))
    waitCtrl.resolve({ status: "launched" })
    await streamText

    const phases = snapshots
      .map(s => s.phase)
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
    // Must include the four interesting sub-phases in order.
    expect(phases).toContain("launching")
    expect(phases).toContain("running")
    expect(phases).toContain("wait-monitor")
    expect(phases).toContain("restoring")
    // launching must precede running which precedes wait-monitor which
    // precedes restoring.
    const indexOf = (p: (typeof phases)[number]) => phases.indexOf(p)
    expect(indexOf("launching")).toBeLessThan(indexOf("running"))
    expect(indexOf("running")).toBeLessThan(indexOf("wait-monitor"))
    expect(indexOf("wait-monitor")).toBeLessThan(indexOf("restoring"))
  })

  // Phase 4D / Track A finishing follow-up. Sessiond's /managed-launch/status
  // endpoint surfaces the same sub-phase the sidecar carries, so the
  // app.server.status RPC proxy can forward it without depending on the
  // sidecar JSON-on-disk path.

  it("surfaces the current sub-phase through /managed-launch/status during a session+wait lifecycle", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = { command: "/bin/wait", args: [] }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      renderer: {
        kind: "chromium",
        launch: async () => ({
          pid: 200,
          command: { command: "chromium", args: [] },
        }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 200, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async receivedSpec => ({
          status: "started" as const,
          result:
            receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise,
          session: {
            id: "child",
            processGroupId:
              receivedSpec.command === waitSpec.command ? 4242 : 1212,
            exited: (receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise
            ).then(r => ({
              exitCode: r.status === "launched" ? 0 : r.exitCode,
            })),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
      },
    })

    const readStatus = async () => {
      const res = await request(core, "/managed-launch/status", authorized())
      return (await res.json()) as {
        active?: { phase?: string; mode: string; launchId: string }
      }
    }

    const pollPhase = async (target: string | undefined, attempts = 40) => {
      for (let i = 0; i < attempts; i++) {
        const s = await readStatus()
        if (
          target === undefined
            ? s.active === undefined
            : s.active?.phase === target
        )
          return s
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      throw new Error(`phase '${target}' not observed in time`)
    }

    await request(core, "/control/start", authorized({ method: "POST" }))
    expect((await readStatus()).active).toBeUndefined()

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "phase-status-1",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=phase-status-1",
      authorized(),
    )
    const streamText = streamResponse.text()

    await pollPhase("running")
    launcherCtrl.resolve({ status: "launched" })
    await pollPhase("wait-monitor")
    waitCtrl.resolve({ status: "launched" })
    await streamText
    // Post-terminal: sessiond returns to idle/home and the active
    // payload is gone, so phase is naturally absent.
    await pollPhase(undefined)
  })

  it("constructs the default kiosk production wiring without invoking OS commands", () => {
    const previous = {
      appIds: process.env.KORRI_SWAY_APP_IDS,
      titles: process.env.KORRI_SWAY_TITLES,
      classes: process.env.KORRI_SWAY_CLASSES,
      timeout: process.env.KORRI_CHROMIUM_READY_TIMEOUT_MS,
    }
    process.env.KORRI_SWAY_APP_IDS = "korri, chromium "
    process.env.KORRI_SWAY_TITLES = " Korri Home "
    process.env.KORRI_SWAY_CLASSES = ""
    process.env.KORRI_CHROMIUM_READY_TIMEOUT_MS = "1234"
    try {
      const core = createKorriSessiondCore({
        logger: silentLogger,
      })
      expect(core.status().state.mode).toBe("stopped")
      expect(core.status().renderer.kind).toBe("chromium")
    } finally {
      setOptionalEnv("KORRI_SWAY_APP_IDS", previous.appIds)
      setOptionalEnv("KORRI_SWAY_TITLES", previous.titles)
      setOptionalEnv("KORRI_SWAY_CLASSES", previous.classes)
      setOptionalEnv("KORRI_CHROMIUM_READY_TIMEOUT_MS", previous.timeout)
    }
  })

  it("starts a real Bun server with idleTimeout disabled and exposes handle status", async () => {
    const role: SessionRole = {
      id: "server-role",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {},
      idleReadyEvidence: () => "idle",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const handle = await startKorriSessiond({
      port: 0,
      hostname: "127.0.0.1",
      role,
      logger: silentLogger,
      launcher: { run: async () => ({ status: "launched" }) },
    })

    try {
      expect(handle.hostname).toBe("127.0.0.1")
      expect(handle.port).toBeGreaterThan(0)
      expect(handle.status().state.mode).toBe("stopped")
    } finally {
      await handle.stop()
    }
  })

  it("starts a real Bun server on a Unix socket and removes stale sockets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-test-"))
    const socketPath = join(dir, "sessiond.sock")
    await Bun.write(socketPath, "stale")
    const role: SessionRole = {
      id: "socket-role",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {},
      idleReadyEvidence: () => "idle",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const handle = await startKorriSessiond({
      socketPath,
      role,
      logger: silentLogger,
      launcher: { run: async () => ({ status: "launched" }) },
    })

    try {
      expect(handle.socketPath).toBe(socketPath)
      expect(handle.port).toBeUndefined()
      expect((await stat(socketPath)).isSocket()).toBe(true)
      expect(handle.status().state.mode).toBe("stopped")
    } finally {
      await handle.stop()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("fails the launch with host-unavailable when afterChildRunning throws", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const role: SessionRole = {
      id: "source-machine",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {
        throw new Error("stream surface never appeared")
      },
      idleReadyEvidence: () => "idle-blank",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      logger: silentLogger,
      role,
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async () => ({
          status: "started" as const,
          result: launcherCtrl.promise,
          session: {
            id: "sessiond-child",
            processGroupId: 1212,
            exited: launcherCtrl.promise.then(r => ({
              exitCode: r.status === "launched" ? 0 : r.exitCode,
            })),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-h", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-h",
      authorized(),
    )
    const streamText = streamResponse.text()
    launcherCtrl.resolve({ status: "launched" })

    const lifecycle = parseSseEvents(await streamText)
    const childExited = lifecycle.find(e => e.type === "child-exited")
    expect(childExited?.terminal?.failureKind).toBe("host-unavailable")
    expect(childExited?.terminal?.stderrTail).toContain(
      "stream surface never appeared",
    )
  })

  // Launch hooks (U5) -- before/after hook execution around the managed child.

  it("advertises launchHooks in managed-launch capabilities", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))
    const response = await request(core, "/managed-launch/status", authorized())
    const body = await response.json()
    expect(body.capabilities.launchHooks).toBe(true)
  })

  it("runs before-hooks before spawn and after-hooks after child exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-hooks-"))
    const log = join(dir, "hooks.log")
    try {
      const order: string[] = []
      const child = deferred<LaunchResult>()
      const { core } = startHarness({
        spawnLaunch: async () => {
          order.push("spawn")
          return {
            result: child.promise,
            terminate: () => {},
            terminateNow: () => {},
          }
        },
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      const start = await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: "launch-hooks",
            spec: { ...spec, env: { HOOK_LOG: log } },
            launchMetadata: {
              annotations: {
                "@korri:game": { id: "snes/echo.smc" },
              },
            },
            hooks: {
              before: [
                {
                  name: "prepare",
                  run: `echo "before:$KORRI_HOOK_PHASE:$KORRI_GAME_ID:$KORRI_LAUNCH_ID" >> "$HOOK_LOG"`,
                },
              ],
              after: [
                {
                  name: "restore",
                  run: `echo "after:$KORRI_HOOK_PHASE" >> "$HOOK_LOG"`,
                },
              ],
            },
          }),
        }),
      )
      expect(await start.json()).toEqual({
        status: "accepted",
        launchId: "launch-hooks",
      })

      // Wait until spawn happened, proving before-hooks completed first.
      for (let index = 0; index < 100 && order.length === 0; index += 1) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      expect(order).toEqual(["spawn"])
      const beforeLines = (await Bun.file(log).text()).trim().split("\n")
      expect(beforeLines).toEqual(["before:before:snes/echo.smc:launch-hooks"])

      child.resolve({ status: "launched" })
      await waitForSessionMode(core, "home")

      const lines = (await Bun.file(log).text()).trim().split("\n")
      expect(lines).toEqual([
        "before:before:snes/echo.smc:launch-hooks",
        "after:after",
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("aborts on before-hook failure, skips spawn, emits hook-failed, and still runs after-hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-hooks-"))
    const log = join(dir, "hooks.log")
    try {
      let spawned = false
      const { core } = startHarness({
        spawnLaunch: async () => {
          spawned = true
          return {
            result: Promise.resolve({ status: "launched" } as LaunchResult),
            terminate: () => {},
            terminateNow: () => {},
          }
        },
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: "launch-hook-abort",
            spec: { ...spec, env: { HOOK_LOG: log } },
            hooks: {
              before: [{ name: "cap-clocks", run: "echo denied >&2; exit 1" }],
              after: [{ name: "undo", run: `echo undone >> "$HOOK_LOG"` }],
            },
          }),
        }),
      )
      await waitForSessionMode(core, "home")

      expect(spawned).toBe(false)
      const lifecycle = parseSseEvents(
        await (
          await request(
            core,
            "/managed-launch/events?launchId=launch-hook-abort",
            authorized(),
          )
        ).text(),
      )
      const hookFailed = lifecycle.find(event => event.type === "hook-failed")
      expect(hookFailed?.hook).toEqual({ name: "cap-clocks", phase: "before" })
      const childExited = lifecycle.find(event => event.type === "child-exited")
      expect(childExited?.terminal?.failureKind).toBe("hook-failed")
      expect(childExited?.terminal?.exitCode).toBe(
        launchFailureExitCode("hook-failed"),
      )
      // After-hooks still ran to undo partial state.
      expect((await Bun.file(log).text()).trim()).toBe("undone")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("runs after-hooks when the child crashes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-hooks-"))
    const log = join(dir, "hooks.log")
    try {
      const { core } = startHarness({
        spawnLaunch: async () => ({
          result: Promise.resolve({
            status: "failed",
            exitCode: 139,
            stderrTail: "segfault",
          } as LaunchResult),
          terminate: () => {},
          terminateNow: () => {},
        }),
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: "launch-hook-crash",
            spec: { ...spec, env: { HOOK_LOG: log } },
            hooks: {
              before: [],
              after: [{ name: "undo", run: `echo undone >> "$HOOK_LOG"` }],
            },
          }),
        }),
      )
      await waitForSessionMode(core, "home")

      expect((await Bun.file(log).text()).trim()).toBe("undone")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("emits hook-failed for a failing after-hook without failing the launch", async () => {
    const { core } = startHarness({
      spawnLaunch: async () => ({
        result: Promise.resolve({ status: "launched" } as LaunchResult),
        terminate: () => {},
        terminateNow: () => {},
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-hook-after-fail",
          spec,
          hooks: {
            before: [],
            after: [{ run: "echo broken >&2; exit 7" }],
          },
        }),
      }),
    )
    await waitForSessionMode(core, "home")

    const lifecycle = parseSseEvents(
      await (
        await request(
          core,
          "/managed-launch/events?launchId=launch-hook-after-fail",
          authorized(),
        )
      ).text(),
    )
    const hookFailed = lifecycle.find(event => event.type === "hook-failed")
    expect(hookFailed?.hook).toEqual({ name: "after[0]", phase: "after" })
    const childExited = lifecycle.find(event => event.type === "child-exited")
    expect(childExited?.terminal?.exitCode).toBe(0)
    expect(lifecycle.some(event => event.type === "home-ready")).toBe(true)
  })

  it("terminating during a before-hook skips spawn and still runs after-hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-hooks-"))
    const log = join(dir, "hooks.log")
    try {
      let spawned = false
      const { core } = startHarness({
        spawnLaunch: async () => {
          spawned = true
          return {
            result: Promise.resolve({ status: "launched" } as LaunchResult),
            terminate: () => {},
            terminateNow: () => {},
          }
        },
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: "launch-hook-stop",
            spec: { ...spec, env: { HOOK_LOG: log } },
            hooks: {
              before: [
                { name: "slow", run: "sleep 30" },
                { name: "never-runs", run: `echo skipped >> "$HOOK_LOG"` },
              ],
              after: [{ name: "undo", run: `echo undone >> "$HOOK_LOG"` }],
            },
          }),
        }),
      )
      // Give the slow before-hook a moment to start, then stop the launch.
      await new Promise(resolve => setTimeout(resolve, 100))
      const terminated = await request(
        core,
        "/managed-launch/terminate",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ launchId: "launch-hook-stop" }),
        }),
      )
      expect(await terminated.json()).toEqual({
        status: "accepted",
        launchId: "launch-hook-stop",
      })
      await waitForSessionMode(core, "home")

      expect(spawned).toBe(false)
      expect((await Bun.file(log).text()).trim()).toBe("undone")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("terminate before before-hooks start skips them and still runs after-hooks", async () => {
    // The terminate request lands while a pre-spawn gate is still running —
    // before the hooks runner exists. The launch must not run before-hooks
    // afterwards; after-hooks still run to undo partial state.
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-hooks-"))
    const log = join(dir, "hooks.log")
    try {
      let spawned = false
      const gateEntered = deferred<void>()
      const gateRelease = deferred<void>()
      const { core } = startHarness({
        spawnLaunch: async () => {
          spawned = true
          return {
            result: Promise.resolve({ status: "launched" } as LaunchResult),
            terminate: () => {},
            terminateNow: () => {},
          }
        },
        preSpawnGates: [
          {
            id: "blocking-gate",
            start: async () => {
              gateEntered.resolve()
              await gateRelease.promise
            },
          },
        ],
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: "launch-stop-before-hooks",
            spec: { ...spec, env: { HOOK_LOG: log } },
            hooks: {
              before: [
                { name: "never-runs", run: `echo before >> "$HOOK_LOG"` },
              ],
              after: [{ name: "undo", run: `echo undone >> "$HOOK_LOG"` }],
            },
          }),
        }),
      )
      await gateEntered.promise
      const terminated = await request(
        core,
        "/managed-launch/terminate",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ launchId: "launch-stop-before-hooks" }),
        }),
      )
      expect(await terminated.json()).toEqual({
        status: "accepted",
        launchId: "launch-stop-before-hooks",
      })
      gateRelease.resolve()
      await waitForSessionMode(core, "home")

      expect(spawned).toBe(false)
      // Before-hook skipped; after-hook still ran.
      expect((await Bun.file(log).text()).trim()).toBe("undone")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("runs after-hooks when the user stops a running child", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-hooks-"))
    const log = join(dir, "hooks.log")
    try {
      const child = deferred<LaunchResult>()
      const { core } = startHarness({
        spawnLaunch: async () => ({
          result: child.promise,
          terminate: () => {
            child.resolve({ status: "failed", exitCode: 130 })
          },
          terminateNow: () => {
            child.resolve({ status: "failed", exitCode: 137 })
          },
        }),
      })
      await request(core, "/control/start", authorized({ method: "POST" }))

      await request(
        core,
        "/managed-launch",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            launchId: "launch-stop-running",
            spec: { ...spec, env: { HOOK_LOG: log } },
            hooks: {
              before: [],
              after: [{ name: "undo", run: `echo undone >> "$HOOK_LOG"` }],
            },
          }),
        }),
      )
      // Wait until the child is running, then user-stop it.
      await waitForSessionMode(core, "game")
      await request(
        core,
        "/managed-launch/terminate",
        authorized({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ launchId: "launch-stop-running" }),
        }),
      )
      await waitForSessionMode(core, "home")

      // After-hooks ran during teardown of the user-stopped child — the
      // dispatcher awaits them before the restoring path completes, so by
      // home-ready the undo step is observable.
      expect((await Bun.file(log).text()).trim()).toBe("undone")
      const lifecycle = parseSseEvents(
        await (
          await request(
            core,
            "/managed-launch/events?launchId=launch-stop-running",
            authorized(),
          )
        ).text(),
      )
      const childExited = lifecycle.find(event => event.type === "child-exited")
      expect(childExited?.terminal?.exitCode).toBe(130)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("does not run any hooks for launches without a hooks payload", async () => {
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: Promise.resolve({ status: "launched" } as LaunchResult),
        terminate: () => {},
        terminateNow: () => {},
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-no-hooks", spec }),
      }),
    )
    await waitForSessionMode(core, "home")

    expect(events).toContain("launch-game:/bin/game")
    const lifecycle = parseSseEvents(
      await (
        await request(
          core,
          "/managed-launch/events?launchId=launch-no-hooks",
          authorized(),
        )
      ).text(),
    )
    expect(lifecycle.some(event => event.type === "hook-failed")).toBe(false)
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

async function waitForSessionMode(
  core: KorriSessiondCore,
  mode: ReturnType<KorriSessiondCore["status"]>["state"]["mode"],
) {
  for (let index = 0; index < 50; index += 1) {
    if (core.status().state.mode === mode) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  expect(core.status().state.mode).toBe(mode)
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function hasKey(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && key in value
}

function parseSseEvents(text: string): readonly SessiondManagedLaunchEvent[] {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map(chunk => {
      const data = chunk
        .split("\n")
        .find(line => line.startsWith("data: "))
        ?.slice("data: ".length)
      if (!data) throw new Error(`missing SSE data in ${chunk}`)
      return JSON.parse(data) as SessiondManagedLaunchEvent
    })
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
