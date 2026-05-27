import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
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

async function tempDir() {
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
  it("posts launch specs to sessiond with a capability token", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []

    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      token: "secret",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect(requests[0].input).toBe("http://127.0.0.1:3003/launch")
    expect(
      (requests[0].init?.headers as Record<string, string>)[
        "x-korri-sessiond-token"
      ],
    ).toBe("secret")
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ spec })
  })

  it("can read the capability from a token file", async () => {
    const dir = await tempDir()
    const tokenFile = join(dir, "token")
    await writeFile(tokenFile, "file-secret\n")
    const requests: RequestInit[] = []

    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      tokenFile,
      fetchImpl: async (_input, init) => {
        requests.push(init ?? {})
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect(
      (requests[0].headers as Record<string, string>)["x-korri-sessiond-token"],
    ).toBe("file-secret")
  })

  it("fails closed when no capability is configured", async () => {
    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      fetchImpl: async () => Response.json({ result: { status: "launched" } }),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(126)
      expect(result.stderrTail).toContain("missing KORRI_SESSIOND_TOKEN")
    }
  })

  it("does not fall back to shell launch when sessiond is unreachable", async () => {
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
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

  it("creates a launcher from env only when KORRI_SESSIOND_URL is present", () => {
    expect(createSessionLauncherFromEnv({})).toBeUndefined()
    expect(
      createSessionLauncherFromEnv({
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
        KORRI_SESSIOND_TOKEN: "secret",
      }),
    ).toBeDefined()
  })

  it("spawns managed sessiond launches and resolves from lifecycle events", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
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

  it("fails managed spawn before requests when no capability is configured", async () => {
    const requests: string[] = []
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
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
      expect(result.result.stderrTail).toContain("missing KORRI_SESSIOND_TOKEN")
    }
    expect(requests).toEqual([])
  })

  it("maps unsupported managed sessiond capability to host-unavailable", async () => {
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      url: "http://127.0.0.1:3003",
      token: "secret",
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

  it("resolves host-unavailable when event stream ends before readiness", async () => {
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      message: "sessiond event stream ended before readiness",
    })
    expect(await result.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
    })
  })

  it("resolves host-unavailable when sessiond emits recovering", async () => {
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      url: "http://127.0.0.1:3003",
      token: "secret",
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
      url: "http://127.0.0.1:3003",
      token: "secret",
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
})

function managedStatus(options: {
  readonly mode: "home" | "game" | "launching"
  readonly capabilities?: {
    readonly managedLaunch: boolean
    readonly lifecycleEvents: boolean
    readonly perLaunchTermination: boolean
  }
}) {
  return {
    schemaVersion: 1,
    mode: options.mode,
    capabilities: options.capabilities ?? {
      managedLaunch: true,
      lifecycleEvents: true,
      perLaunchTermination: true,
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
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        for (const item of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(item)}\n\n`),
          )
        }
        if (events.length > 0) controller.close()
      },
    }),
  )
}
