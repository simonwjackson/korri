import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import type { LaunchSpec } from "./launcher"
import {
  createSessionLauncher,
  createSessionLauncherFromEnv,
  launchViaSessiond,
} from "./session-launcher"
import type { SessiondManagedLaunchEvent } from "./sessiond-managed-launch-protocol"

const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function _tempDir() {
  const path = join(
    process.cwd(),
    "out/tmp/session-launcher",
    crypto.randomUUID(),
  )
  await mkdir(path, { recursive: true })
  tempDirs.push(path)
  return path
}

describe("session launcher", () => {
  it("posts launch specs to sessiond over the configured socket", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []

    const result = await launchViaSessiond(spec, {
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect(requests[0].input).toBe("http://korri-sessiond/launch")
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ spec })
  })

  it("adds Bun's unix socket option to launch requests", async () => {
    const requests: RequestInit[] = []

    const result = await launchViaSessiond(spec, {
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (_input, init) => {
        requests.push(init ?? {})
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect((requests[0] as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
  })

  it("fails closed when no sessiond socket is configured", async () => {
    const result = await launchViaSessiond(spec, {
      fetchImpl: async () => Response.json({ result: { status: "launched" } }),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(126)
      expect(result.stderrTail).toContain("missing KORRI_SESSIOND_SOCKET")
    }
  })

  it("does not fall back to shell launch when sessiond is unreachable", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async () => {
        throw new Error("connection refused")
      },
    })

    const result = await launcher.run(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(125)
      expect(result.stderrTail).toContain("connection refused")
    }
  })

  it("creates a launcher from env only when KORRI_SESSIOND_SOCKET is present", () => {
    expect(createSessionLauncherFromEnv({})).toBeUndefined()
    expect(
      createSessionLauncherFromEnv({
        KORRI_SESSIOND_SOCKET: "/run/user/1000/korri/sessiond.sock",
      }),
    ).toBeDefined()
  })

  it("spawns managed sessiond launches and resolves from lifecycle events", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({ sequence: 1, launchId: "launch-1", type: "child-running" }),
            event({
              sequence: 2,
              launchId: "launch-1",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-1",
              type: "home-ready",
              readiness: { status: "ok", evidence: "home-invariant-satisfied" },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("started")
    if (result.status === "started") {
      expect(result.session.id).toBe("launch-1")
      expect(await result.session.exited).toEqual({ exitCode: 0 })
      expect(await result.result).toEqual({ status: "launched" })
    }
    expect(requests.map(request => new URL(request.input).pathname)).toEqual([
      "/managed-launch/status",
      "/managed-launch",
      "/managed-launch/events",
    ])
  })

  it("reconnects when the lifecycle event stream closes before a terminal event", async () => {
    // A healthy long-running launch can close the events SSE stream
    // mid-flight if the upstream Bun.serve idleTimeout fires before
    // sessiond emits a heartbeat. The previous behavior settled the
    // launch as host-unavailable and terminated the still-running
    // game; the correct behavior is to reconnect and keep observing.
    let eventsRequestCount = 0
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-rc" })
        }
        if (url.pathname === "/managed-launch/events") {
          eventsRequestCount += 1
          if (eventsRequestCount === 1) {
            // First connection: emit a non-terminal event, then close
            // the stream without any child-exited / terminated signal.
            return eventStream([
              event({
                sequence: 1,
                launchId: "launch-rc",
                type: "child-running",
              }),
            ])
          }
          // Second connection: emit terminal events.
          return eventStream([
            event({
              sequence: 2,
              launchId: "launch-rc",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-rc",
              type: "home-ready",
              readiness: { status: "ok", evidence: "home-invariant-satisfied" },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("started")
    if (result.status === "started") {
      expect(await result.session.exited).toEqual({ exitCode: 0 })
      expect(await result.result).toEqual({ status: "launched" })
    }
    expect(eventsRequestCount).toBeGreaterThanOrEqual(2)
  })

  it("fails managed spawn before requests when no socket is configured", async () => {
    const requests: string[] = []
    const launcher = createSessionLauncher({
      fetchImpl: async input => {
        requests.push(input)
        return Response.json({})
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.exitCode).toBe(126)
      expect(result.result.failureKind).toBe("host-control-disabled")
      expect(result.result.stderrTail).toContain(
        "missing KORRI_SESSIOND_SOCKET",
      )
    }
    expect(requests).toEqual([])
  })

  it("maps unsupported managed sessiond capability to host-unavailable", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async () =>
        Response.json(
          managedStatus({
            mode: "home",
            capabilities: {
              managedLaunch: false,
              lifecycleEvents: false,
              perLaunchTermination: false,
            },
          }),
        ),
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.exitCode).toBe(124)
      expect(result.result.failureKind).toBe("host-unavailable")
      expect(result.result.stderrTail).toContain("managed launch unsupported")
    }
  })

  it("maps managed sessiond busy responses to session-busy", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({
            status: "failed",
            failureKind: "session-busy",
            message: "sessiond is game; launch requires home",
          })
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.exitCode).toBe(121)
      expect(result.result.failureKind).toBe("session-busy")
      expect(result.result.stderrTail).toContain("sessiond is game")
    }
  })

  it("maps non-home sessiond preflight status to session-busy without starting", async () => {
    const requests: string[] = []
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        requests.push(new URL(input).pathname)
        return Response.json(managedStatus({ mode: "game" }))
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.failureKind).toBe("session-busy")
    }
    expect(requests).toEqual(["/managed-launch/status"])
  })

  it("maps invalid managed status payloads to host-unavailable", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async () => Response.json({ status: "not-sessiond-status" }),
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.failureKind).toBe("host-unavailable")
      expect(result.result.stderrTail).toContain("status payload invalid")
    }
  })

  it("preserves failureKind from child-exited lifecycle events", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-1",
              type: "child-exited",
              terminal: {
                exitCode: 124,
                failureKind: "host-unavailable",
                stderrTail: "daemon lost child",
              },
            }),
            event({
              sequence: 2,
              launchId: "launch-1",
              type: "home-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.result).toEqual({
      status: "failed",
      exitCode: 124,
      failureKind: "host-unavailable",
      stderrTail: "daemon lost child",
    })
  })

  it("resolves host-unavailable when event stream request is rejected", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return new Response(null, { status: 500 })
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.ready).toMatchObject({
      status: "failed",
      message: expect.stringContaining("sessiond event stream rejected: 500"),
    })
    expect(await result.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
    })
  })

  it("resolves host-unavailable when event stream subscription throws", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          throw new Error("network down")
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
      stderrTail: expect.stringContaining("network down"),
    })
  })

  it("resolves host-unavailable when readiness times out after child exit", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      requestTimeoutMs: 20,
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return openEventStream([
            event({
              sequence: 1,
              launchId: "launch-1",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
      stderrTail: "sessiond event stream timed out before readiness",
    })
  })

  it("resolves host-unavailable when event stream ends before readiness", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-1",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.ready).toMatchObject({
      status: "failed",
      message: expect.stringContaining("event stream ended before readiness"),
    })
    expect(await result.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
    })
  })

  it("resolves host-unavailable when sessiond emits recovering", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-1",
              type: "recovering",
              message: "renderer failed",
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.exited).toEqual({ exitCode: null })
    expect(await result.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
      stderrTail: "renderer failed",
    })
  })

  it("sends per-launch termination for managed session handles", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([])
        }
        if (url.pathname === "/managed-launch/terminate") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    result.session.terminate()
    await Promise.resolve()

    const terminate = requests.find(
      request =>
        new URL(request.input).pathname === "/managed-launch/terminate",
    )
    expect(terminate).toBeDefined()
    expect(JSON.parse(String(terminate?.init?.body))).toEqual({
      launchId: "launch-1",
    })
  })

  it("sends force when terminateNow is invoked", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") return eventStream([])
        if (url.pathname === "/managed-launch/terminate") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    result.session.terminateNow()
    await Promise.resolve()

    const terminate = requests.find(
      request =>
        new URL(request.input).pathname === "/managed-launch/terminate",
    )
    expect(JSON.parse(String(terminate?.init?.body))).toEqual({
      launchId: "launch-1",
      force: true,
    })
  })

  it("resolves managed readiness on idle-ready with the source-machine gate string", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({ sequence: 1, launchId: "launch-1", type: "child-running" }),
            event({
              sequence: 2,
              launchId: "launch-1",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-1",
              type: "idle-ready",
              readiness: { status: "ok", evidence: "idle-blank-satisfied" },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.exited).toEqual({ exitCode: 0 })
    expect(await result.result).toEqual({ status: "launched" })
    const ready = await result.session.ready
    if (!ready) throw new Error("expected readiness signal")
    expect(ready.status).toBe("ok")
    expect(ready.evidence).toEqual({ gate: "sessiond-idle-ready" })
  })

  it("preflight accepts mode: 'idle' without returning session-busy", async () => {
    const requests: string[] = []
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        requests.push(url.pathname)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-2" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-2",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 2,
              launchId: "launch-2",
              type: "idle-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)

    expect(result.status).toBe("started")
    expect(requests).toContain("/managed-launch")
    expect(requests).toContain("/managed-launch/events")
  })

  // Phase 4D / Track A -- session lifecycle.

  const waitSpec: LaunchSpec = {
    command: "/bin/steam-wait-monitor.sh",
    args: ["--pid-tree"],
  }

  it("forwards lifecycle, launch metadata, and wait into the managed-launch start request", async () => {
    let startBody: unknown
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          startBody = init?.body && JSON.parse(String(init.body))
          return Response.json({ status: "accepted", launchId: "launch-7" })
        }
        if (url.pathname === "/managed-launch/events") {
          return openEventStream([])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    void spawn(spec, {
      lifecycle: "session",
      launchMetadata: { appProviderId: "@korri:steam" },
      wait: waitSpec,
    })
    // Allow the preflight + start request to flush.
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(startBody).toEqual({
      spec,
      lifecycle: "session",
      launchMetadata: { appProviderId: "@korri:steam" },
      wait: waitSpec,
    })
  })

  it("omits lifecycle and wait fields when not requested (Phase 4B kiosk start shape unchanged)", async () => {
    let startBody: unknown
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          startBody = init?.body && JSON.parse(String(init.body))
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return openEventStream([])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    void spawn(spec)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(startBody).toEqual({ spec })
  })

  it("fails fast with host-unavailable when caller asks for session lifecycle but the daemon lacks the capability", async () => {
    const requests: string[] = []
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        requests.push(new URL(input).pathname)
        return Response.json(
          managedStatus({
            mode: "idle",
            capabilities: {
              managedLaunch: true,
              lifecycleEvents: true,
              perLaunchTermination: true,
              sessionLifecycle: false,
            },
          }),
        )
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    const result = await spawn(spec, { lifecycle: "session", wait: waitSpec })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.failureKind).toBe("host-unavailable")
      expect(result.result.stderrTail).toContain("sessionLifecycle")
    }
    expect(requests).toEqual(["/managed-launch/status"])
  })

  it("accepts session lifecycle when sessionLifecycle is absent and the request is foreground (back-compat preflight)", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(
            managedStatus({
              mode: "home",
              capabilities: {
                managedLaunch: true,
                lifecycleEvents: true,
                perLaunchTermination: true,
                // sessionLifecycle omitted -- Phase 4B daemon.
              },
            }),
          )
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-1" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-1",
              type: "child-running",
            }),
            event({
              sequence: 2,
              launchId: "launch-1",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-1",
              type: "home-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    const result = await spawn(spec) // no extras
    expect(result.status).toBe("started")
  })

  it("resolves session+wait launches from wait-monitor-exited", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-7" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-7",
              type: "child-running",
            }),
            event({
              sequence: 2,
              launchId: "launch-7",
              type: "launcher-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-7",
              type: "wait-monitor-running",
            }),
            event({
              sequence: 4,
              launchId: "launch-7",
              type: "wait-monitor-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 5,
              launchId: "launch-7",
              type: "idle-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    const result = await spawn(spec, { lifecycle: "session", wait: waitSpec })
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.exited).toEqual({ exitCode: 0 })
    expect(await result.result).toEqual({ status: "launched" })
  })

  it("propagates non-zero wait-monitor-exited exit codes", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-7" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-7",
              type: "child-running",
            }),
            event({
              sequence: 2,
              launchId: "launch-7",
              type: "launcher-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-7",
              type: "wait-monitor-running",
            }),
            event({
              sequence: 4,
              launchId: "launch-7",
              type: "wait-monitor-exited",
              terminal: { exitCode: 137, failureKind: "command-failed" },
            }),
            event({
              sequence: 5,
              launchId: "launch-7",
              type: "idle-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    const result = await spawn(spec, { lifecycle: "session", wait: waitSpec })
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.exited).toEqual({ exitCode: 137 })
    const finalResult = await result.result
    if (finalResult.status !== "failed") throw new Error("expected failed")
    expect(finalResult.exitCode).toBe(137)
    expect(finalResult.failureKind).toBe("command-failed")
  })

  it("resolves session+anchor launches after terminated + idle-ready (anchor pending until external terminate)", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-9" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-9",
              type: "child-running",
            }),
            event({
              sequence: 2,
              launchId: "launch-9",
              type: "launcher-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 3,
              launchId: "launch-9",
              type: "session-anchored",
              readiness: {
                status: "ok",
                evidence: "launcher exited; anchor holding",
              },
            }),
            event({
              sequence: 4,
              launchId: "launch-9",
              type: "terminated",
            }),
            event({
              sequence: 5,
              launchId: "launch-9",
              type: "idle-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    const result = await spawn(spec, { lifecycle: "session" })
    if (result.status !== "started") throw new Error("expected started")

    expect(await result.session.exited).toEqual({ exitCode: 0 })
    expect(await result.result).toEqual({ status: "launched" })
  })

  it("degrades to child-exited handling when session launcher exits non-zero (no launcher-exited emitted)", async () => {
    // Models the documented graceful degradation: sessiond observes a
    // non-zero launcher exit under lifecycle: "session" and emits
    // child-exited (terminal) instead of launcher-exited.
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "idle" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-7" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-7",
              type: "child-running",
            }),
            event({
              sequence: 2,
              launchId: "launch-7",
              type: "child-exited",
              terminal: { exitCode: 2, failureKind: "command-failed" },
            }),
            event({
              sequence: 3,
              launchId: "launch-7",
              type: "idle-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected: ${input}`)
      },
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("missing managed spawn")
    const result = await spawn(spec, { lifecycle: "session", wait: waitSpec })
    if (result.status !== "started") throw new Error("expected started")
    expect(await result.session.exited).toEqual({ exitCode: 2 })
    const finalResult = await result.result
    if (finalResult.status !== "failed") throw new Error("expected failed")
    expect(finalResult.exitCode).toBe(2)
  })

  it("still resolves managed readiness on home-ready (Phase 4B kiosk shape unchanged)", async () => {
    const launcher = createSessionLauncher({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async input => {
        const url = new URL(input)
        if (url.pathname === "/managed-launch/status") {
          return Response.json(managedStatus({ mode: "home" }))
        }
        if (url.pathname === "/managed-launch") {
          return Response.json({ status: "accepted", launchId: "launch-3" })
        }
        if (url.pathname === "/managed-launch/events") {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-3",
              type: "child-exited",
              terminal: { exitCode: 0 },
            }),
            event({
              sequence: 2,
              launchId: "launch-3",
              type: "home-ready",
              readiness: { status: "ok" },
            }),
          ])
        }
        throw new Error(`unexpected request: ${input}`)
      },
    })

    const spawn = launcher.spawn
    if (!spawn) throw new Error("session launcher missing managed spawn")
    const result = await spawn(spec)
    if (result.status !== "started") throw new Error("expected started")

    const ready = await result.session.ready
    if (!ready) throw new Error("expected readiness signal")
    expect(ready.status).toBe("ok")
    expect(ready.evidence).toEqual({ gate: "sessiond-home-ready" })
  })
})

function managedStatus(options: {
  readonly mode: "home" | "idle" | "game" | "launching"
  readonly capabilities?: {
    readonly managedLaunch: boolean
    readonly lifecycleEvents: boolean
    readonly perLaunchTermination: boolean
    readonly sessionLifecycle?: boolean
  }
}) {
  return {
    schemaVersion: 1,
    mode: options.mode,
    capabilities: options.capabilities ?? {
      managedLaunch: true,
      lifecycleEvents: true,
      perLaunchTermination: true,
      sessionLifecycle: true,
    },
    restoreAttempts: 0,
  }
}

function event(
  input: Omit<SessiondManagedLaunchEvent, "schemaVersion" | "at">,
): SessiondManagedLaunchEvent {
  return {
    schemaVersion: 1,
    at: "2026-05-26T00:00:00.000Z",
    ...input,
  }
}

function eventStream(events: readonly SessiondManagedLaunchEvent[]): Response {
  return eventStreamResponse(events, true)
}

function openEventStream(
  events: readonly SessiondManagedLaunchEvent[],
): Response {
  return eventStreamResponse(events, false)
}

function eventStreamResponse(
  events: readonly SessiondManagedLaunchEvent[],
  close: boolean,
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        for (const item of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(item)}\n\n`),
          )
        }
        if (close) controller.close()
      },
    }),
  )
}
