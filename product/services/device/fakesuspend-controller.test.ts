import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createFakeSuspendController,
  type FakeSuspendCommand,
} from "./fakesuspend-controller"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function tempRoot() {
  const path = await mkdtemp(join(tmpdir(), "korri-fakesuspend-"))
  tempDirs.push(path)
  return path
}

interface HarnessSessiondState {
  readonly active?: {
    readonly launchId: string
    readonly phase?: string
    readonly streamControlUrl?: string
  }
  readonly launchFreeze?: boolean
}

async function makeHarness(
  options: {
    readonly createRequestDir?: boolean
    readonly sessiondState?: HarnessSessiondState
    readonly freezeRemoteGame?: (controlUrl: string) => Promise<void>
  } = {},
) {
  const root = await tempRoot()
  const runtimeDir = join(root, "runtime")
  const requestDir = join(root, "requests")
  const resultDir = join(root, "status")
  await mkdir(runtimeDir, { recursive: true })
  await mkdir(resultDir, { recursive: true })
  if (options.createRequestDir !== false) await mkdir(requestDir)

  const commands: FakeSuspendCommand[] = []
  const sessiondRequests: Array<{
    readonly path: string
    readonly body?: string
  }> = []
  const state = options.sessiondState
  const sessiond = state
    ? {
        url: "http://sessiond",
        fetchImpl: (async (input: string, init?: RequestInit) => {
          const path = new URL(String(input)).pathname
          sessiondRequests.push({
            path,
            body: init?.body ? String(init.body) : undefined,
          })
          if (path === "/managed-launch/status") {
            return Response.json({
              schemaVersion: 1,
              mode: state.active ? "game" : "home",
              capabilities: {
                managedLaunch: true,
                lifecycleEvents: true,
                perLaunchTermination: true,
                ...(state.launchFreeze !== undefined
                  ? { launchFreeze: state.launchFreeze }
                  : {}),
              },
              ...(state.active
                ? {
                    active: {
                      launchId: state.active.launchId,
                      mode: "game",
                      ...(state.active.phase
                        ? { phase: state.active.phase }
                        : {}),
                      ...(state.active.streamControlUrl !== undefined
                        ? {
                            launchMetadata: {
                              annotations: {
                                "@korri:stream": {
                                  controlUrl: state.active.streamControlUrl,
                                },
                              },
                            },
                          }
                        : {}),
                    },
                  }
                : {}),
              restoreAttempts: 0,
            })
          }
          return Response.json({
            status: "accepted",
            launchId: state.active?.launchId ?? "unknown",
          })
        }) as typeof fetch,
      }
    : { env: {} as NodeJS.ProcessEnv }
  const controller = createFakeSuspendController({
    runtimeDir,
    requestDir,
    resultDir,
    now: () => 10_000,
    ackTimeoutMs: 0,
    commandRunner: async command => {
      commands.push(command)
    },
    sessiond,
    ...(options.freezeRemoteGame
      ? { freezeRemoteGame: options.freezeRemoteGame }
      : {}),
  })

  return {
    root,
    runtimeDir,
    requestDir,
    resultDir,
    commands,
    controller,
    sessiondRequests,
  }
}

describe("fake suspend controller", () => {
  it("suspends by blanking Sway, writing an active marker, and requesting substrate enter", async () => {
    const { runtimeDir, requestDir, commands, controller } = await makeHarness()
    await writeFile(join(runtimeDir, "sway-ipc.100.sock"), "")

    const result = await controller.run("suspend")

    expect(result.status).toBe("requested")
    expect(commands).toEqual([
      {
        command: "swaymsg",
        args: ["output", "*", "power", "off"],
        env: { SWAYSOCK: join(runtimeDir, "sway-ipc.100.sock") },
      },
    ])
    expect(
      await readFile(join(runtimeDir, "korri-fakesuspend", "active"), "utf8"),
    ).toContain("suspended")
    expect(await readFile(join(requestDir, "enter.request"), "utf8")).toBe("")
    expect(
      (await stat(join(runtimeDir, "korri-fakesuspend"))).mode & 0o777,
    ).toBe(0o700)
  })

  it("does not write exit.request when resume is requested without an active marker", async () => {
    const { requestDir, controller } = await makeHarness()

    const result = await controller.run("resume")

    expect(result).toEqual({ status: "noop", reason: "not-suspended" })
    await expect(stat(join(requestDir, "exit.request"))).rejects.toThrow()
  })

  it("does not create the substrate request directory when it is missing", async () => {
    const { requestDir, controller } = await makeHarness({
      createRequestDir: false,
    })

    const result = await controller.run("suspend")

    expect(result).toEqual({
      status: "degraded",
      reason: "request-dir-missing",
    })
    await expect(stat(requestDir)).rejects.toThrow()
  })

  it("reports substrate-unavailable when the watcher does not acknowledge a request", async () => {
    const { controller } = await makeHarness()

    const result = await controller.run("suspend")

    expect(result).toEqual({ status: "requested" })
  })

  it("maps a fresh watcher acknowledgement to applied", async () => {
    const { resultDir, controller } = await makeHarness()
    await writeFile(
      join(resultDir, "last-request"),
      "action=enter\nstatus=processed\nresult=ok\n",
    )

    const result = await controller.run("suspend")

    expect(result).toEqual({ status: "applied" })
  })

  it("debounces repeated power toggles", async () => {
    const { controller } = await makeHarness()

    expect(await controller.run("toggle")).toEqual({ status: "requested" })
    expect(await controller.run("toggle")).toEqual({
      status: "noop",
      reason: "debounced",
    })
  })

  it("does not resume from power toggle while the lid-closed marker is active", async () => {
    const { runtimeDir, controller } = await makeHarness()
    await controller.run("suspend")
    await writeFile(join(runtimeDir, "korri-fakesuspend", "lid-closed"), "1\n")

    const result = await controller.run("toggle")

    expect(result).toEqual({ status: "noop", reason: "lid-closed" })
  })

  it("freezes an active local game on suspend instead of terminating it", async () => {
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: {
        active: { launchId: "local-1" },
        launchFreeze: true,
      },
    })

    await controller.run("suspend")

    const paths = sessiondRequests.map(request => request.path)
    expect(paths).toContain("/managed-launch/freeze")
    expect(paths).not.toContain("/managed-launch/terminate")
    const freeze = sessiondRequests.find(
      request => request.path === "/managed-launch/freeze",
    )
    expect(JSON.parse(freeze?.body ?? "{}")).toEqual({ launchId: "local-1" })
  })

  it("skips the local freeze when sessiond lacks the launchFreeze capability", async () => {
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: { active: { launchId: "local-1" } },
    })

    await controller.run("suspend")

    const paths = sessiondRequests.map(request => request.path)
    expect(paths).not.toContain("/managed-launch/freeze")
    expect(paths).not.toContain("/managed-launch/terminate")
  })

  it("remote-freezes the host game then terminates the local stream launch on suspend", async () => {
    const remoteCalls: string[] = []
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: {
        active: {
          launchId: "stream-1",
          streamControlUrl: "http://aka:3001",
        },
        launchFreeze: true,
      },
      freezeRemoteGame: async controlUrl => {
        remoteCalls.push(controlUrl)
      },
    })

    await controller.run("suspend")

    expect(remoteCalls).toEqual(["http://aka:3001"])
    const terminate = sessiondRequests.find(
      request => request.path === "/managed-launch/terminate",
    )
    expect(JSON.parse(terminate?.body ?? "{}")).toEqual({
      launchId: "stream-1",
    })
    expect(sessiondRequests.map(request => request.path)).not.toContain(
      "/managed-launch/freeze",
    )
  })

  it("still terminates the local stream launch when the remote freeze fails", async () => {
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: {
        active: {
          launchId: "stream-1",
          streamControlUrl: "http://aka:3001",
        },
      },
      freezeRemoteGame: async () => {
        throw new Error("host unreachable")
      },
    })

    await controller.run("suspend")

    expect(sessiondRequests.map(request => request.path)).toContain(
      "/managed-launch/terminate",
    )
  })

  it("terminates without a remote freeze when the stream has no controlUrl", async () => {
    const remoteCalls: string[] = []
    // streamControlUrl absent but the launch is still stream-annotated.
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: {
        active: { launchId: "stream-1", streamControlUrl: "" },
      },
      freezeRemoteGame: async controlUrl => {
        remoteCalls.push(controlUrl)
      },
    })

    await controller.run("suspend")

    expect(remoteCalls).toEqual([])
    expect(sessiondRequests.map(request => request.path)).toContain(
      "/managed-launch/terminate",
    )
  })

  it("thaws a frozen local game on resume", async () => {
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: {
        active: { launchId: "local-1", phase: "frozen" },
        launchFreeze: true,
      },
    })

    await controller.run("suspend")
    sessiondRequests.length = 0
    await controller.run("resume")

    const thaw = sessiondRequests.find(
      request => request.path === "/managed-launch/thaw",
    )
    expect(JSON.parse(thaw?.body ?? "{}")).toEqual({ launchId: "local-1" })
  })

  it("does not thaw on resume when nothing is frozen", async () => {
    const { controller, sessiondRequests } = await makeHarness({
      sessiondState: {
        active: { launchId: "local-1", phase: "running" },
        launchFreeze: true,
      },
    })

    await controller.run("suspend")
    sessiondRequests.length = 0
    await controller.run("resume")

    expect(sessiondRequests.map(request => request.path)).not.toContain(
      "/managed-launch/thaw",
    )
  })
})
