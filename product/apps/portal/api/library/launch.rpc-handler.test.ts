import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { EntrySource } from "@platform/api/rpc/entry-source"
import { NotFoundError } from "@platform/api/rpc/errors"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import {
  Launcher,
  LibraryError,
  LibrarySource,
  type ResolvedLocalLauncherPolicy,
} from "@platform/library/library-services"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { createShellLauncher } from "@platform/library/shell-launcher"
import type { ForegroundSessionState } from "@platform/session/foreground-session-lifecycle"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import {
  createSteamLogObserver,
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
} from "@product/plugins/steam/src/observability/log-observer"
import { Cause, Effect, Exit, Layer } from "effect"
import { mirrorLibraryAsConfigFragment } from "../../../../../tools/testing/library/with-temp-proseql-library"

import {
  createForegroundSessionHost,
  ForegroundSessionHost,
} from "./foreground-session-host-layer"
import { handleLaunchLibrary } from "./launch.rpc-handler"
import {
  RemoteStreamPrepare,
  type RemoteStreamPrepareService,
} from "./remote-stream-prepare"

const originalLibraryRoot = process.env.KORRI_LIBRARY_ROOT
const originalConfigRoots = process.env.KORRI_CONFIG_ROOTS
const originalEnabledPlugins = process.env.KORRI_ENABLED_PLUGINS
const cleanups: Array<() => Promise<void>> = []

// Shared `source` payload field for tests. The launch handler does not
// route on this in U1 (local path only) but the schema requires it.
const localTestSource = new EntrySource({
  hostId: "launch-test-host",
  controlUrl: "http://127.0.0.1:3001",
  isLocal: true,
})
const REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const FAKE_GAME = join(REPO_ROOT, "tools", "testing", "fake-game.sh")
const wrapperProvider = "@example:wrapper"

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalLibraryRoot)
  setOptionalEnv("KORRI_CONFIG_ROOTS", originalConfigRoots)
  setOptionalEnv("KORRI_ENABLED_PLUGINS", originalEnabledPlugins)
  resetSteamLogObserverStatusForTests()
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

async function layerForFakeGame(exitCode: number): Promise<{
  layer: Layer.Layer<
    LibrarySource | Launcher | ForegroundSessionHost | RemoteStreamPrepare
  >
}> {
  const lib = await withTempProseqlLibrary()
  cleanups.push(lib.cleanup)
  process.env.KORRI_LIBRARY_ROOT = lib.root
  process.env.KORRI_CONFIG_ROOTS = lib.root
  // Remote-source launches dispatch the Moonlight streamer through the registry.
  process.env.KORRI_ENABLED_PLUGINS = "@korri:moonlight"

  const realLauncher = createShellLauncher()
  const launcherLayer = Layer.succeed(Launcher)({
    run: spec =>
      Effect.tryPromise({
        try: () =>
          realLauncher.run({
            ...spec,
            env: {
              ...(spec.env ?? {}),
              KORRI_FAKE_GAME_EXIT: String(exitCode),
            },
          }),
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
    spawn: spec =>
      Effect.tryPromise({
        try: () => {
          const spawn = realLauncher.spawn
          if (!spawn) throw new Error("shell launcher missing managed spawn")
          return spawn({
            ...spec,
            env: {
              ...(spec.env ?? {}),
              KORRI_FAKE_GAME_EXIT: String(exitCode),
            },
          })
        },
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })

  return {
    layer: Layer.mergeAll(
      LibrarySourceLayerLive,
      launcherLayer,
      Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
      remoteStreamPrepareNeverCalledLayer,
    ),
  }
}

describe("app.library.launch handler (configured-real launcher + fake-game.sh)", () => {
  it("returns { status: 'launched' } for a known ProseQL-backed id with KORRI_FAKE_GAME_EXIT=0", async () => {
    const { layer } = await layerForFakeGame(0)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
  })

  it("runs the local launch path unchanged for a local-tagged `source` payload", async () => {
    const { layer } = await layerForFakeGame(0)
    // Federation routing on the server-side: local-tagged entries
    // continue through sessiond / the existing launcher path.
    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: localTestSource,
      }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
  })

  it("dispatches a remote-source LaunchInput as a companion-ready Korri Stream moonlight launch", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    let preparedFor: { controlUrl?: string; gameId?: string } | undefined
    let dispatchedExtras: unknown
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (controlUrl, gameId) => {
              preparedFor = { controlUrl, gameId }
              return Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-xyz",
              })
            },
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
            launchedExtras: extras => {
              dispatchedExtras = extras
            },
          }),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(preparedFor).toEqual({
      controlUrl: "http://aka.local:3001",
      gameId: "snes/echo.smc",
    })
    expect(dispatchedSpec?.command).toBe("moonlight")
    expect(dispatchedSpec?.args).toEqual([
      "stream",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
    expect(dispatchedExtras).toMatchObject({
      launchMetadata: {
        annotations: {
          "@korri:stream": {
            hostId: "aka",
            controlUrl: "http://aka.local:3001",
          },
        },
      },
    })
  })

  it("passes typed local Moonlight input policy for remote-source launches", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (_controlUrl, gameId) =>
              Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-input",
              }),
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
            localPolicy: {
              launchCompanions: {},
              moonlight: { input: { devices: ["/dev/input/event8"] } },
            },
          }),
        ),
      ),
    )

    expect(dispatchedSpec?.args).toEqual([
      "stream",
      "-input",
      "/dev/input/event8",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("launches remote-source Moonlight at bitrate startup while retaining ceiling", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
        streamBoundaryArgs: ["--bitrate=500k..6m..40m"],
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (_controlUrl, gameId) =>
              Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-startup",
              }),
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
            localPolicy: {
              launchCompanions: {},
              moonlight: {
                stream: {
                  bitrateKbps: 40_000,
                  fps: 120,
                  resolution: { width: 1920, height: 1080 },
                },
              },
            },
          }),
        ),
      ),
    )

    expect(dispatchedSpec?.args).toEqual([
      "stream",
      "-width",
      "1920",
      "-height",
      "1080",
      "-fps",
      "120",
      "-bitrate",
      "6000",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("uses configured Moonlight stream ranges for remote-source launch defaults", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (_controlUrl, gameId) =>
              Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-config-range",
              }),
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
            localPolicy: {
              launchCompanions: {},
              moonlight: {
                stream: {
                  resolution: {
                    min: { width: 640, height: 360 },
                    start: { width: 1280, height: 720 },
                    max: { width: 1920, height: 1080 },
                  },
                  fps: 120,
                  bitrateKbps: { min: 500, start: 6000, max: 40000 },
                },
              },
            },
          }),
        ),
      ),
    )

    expect(dispatchedSpec?.args).toEqual([
      "stream",
      "-width",
      "1280",
      "-height",
      "720",
      "-fps",
      "120",
      "-bitrate",
      "6000",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("rejects invalid configured Moonlight stream ranges before peer prepare", async () => {
    let prepareCalls = 0
    let launchCalls = 0
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: () => {
              prepareCalls += 1
              return Effect.succeed({
                status: "prepared" as const,
                gameId: "snes/echo.smc",
                sessionId: "sess-invalid-config-range",
              })
            },
            launchedSpec: () => {
              launchCalls += 1
            },
            localPolicy: {
              launchCompanions: {},
              moonlight: {
                stream: { bitrateKbps: { min: 500, max: 40000 } },
              },
            },
          }),
        ),
      ),
    )

    expect(result.status).toBe("failed")
    if (result.status !== "failed") throw new Error("expected failed launch")
    expect(result.stderrTail).toContain("start")
    expect(prepareCalls).toBe(0)
    expect(launchCalls).toBe(0)
  })

  it("fills missing remote-source startup bitrate from preflight", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
        streamBoundaryArgs: ["bitrate=500k..40m"],
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (_controlUrl, gameId) =>
              Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-prefill",
              }),
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
            localPolicy: {
              launchCompanions: {},
              moonlight: {
                stream: {
                  bitrateKbps: 40_000,
                  fps: 120,
                  resolution: { width: 1920, height: 1080 },
                },
              },
            },
          }),
        ),
      ),
    )

    expect(dispatchedSpec?.args).toContain("-bitrate")
    expect(dispatchedSpec?.args).toContain("3000")
  })

  it("rejects required stream preflight before peer prepare", async () => {
    let prepareCalls = 0
    let launchCalls = 0
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
        streamBoundaryArgs: ["bitrate=500k..40m"],
        streamPreflight: "required" as never,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: () => {
              prepareCalls += 1
              return Effect.succeed({
                status: "prepared" as const,
                gameId: "snes/echo.smc",
                sessionId: "sess-required",
              })
            },
            launchedSpec: () => {
              launchCalls += 1
            },
            localPolicy: { launchCompanions: {}, moonlight: {} },
          }),
        ),
      ),
    )

    expect(result.status).toBe("failed")
    if (result.status !== "failed") throw new Error("expected failed launch")
    expect(result.stderrTail).toContain("Stream preflight rejected launch")
    expect(prepareCalls).toBe(0)
    expect(launchCalls).toBe(0)
  })

  it("injects typed local-control env for remote-source launches before dispatch", async () => {
    let dispatchedSpec:
      | {
          command: string
          args: ReadonlyArray<string>
          env?: Readonly<Record<string, string>>
          envUnset?: readonly string[]
        }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const previousRuntimeDir = process.env.KORRI_GAME_STREAM_RUNTIME_DIR
    process.env.KORRI_GAME_STREAM_RUNTIME_DIR = "/tmp/korri-game-stream-test"
    try {
      await Effect.runPromise(
        handleLaunchLibrary({
          id: "snes/echo.smc",
          source: remoteSource,
        }).pipe(
          Effect.provide(
            remoteSourceTestLayer({
              prepare: (_controlUrl, gameId) =>
                Effect.succeed({
                  status: "prepared" as const,
                  gameId,
                  sessionId: "sess-control",
                }),
              launchedSpec: spec => {
                dispatchedSpec = spec
              },
              localPolicy: {
                launchCompanions: {},
                moonlight: {
                  environment: { OLD_ENV: null },
                  control: {
                    enable: true,
                    authority: "controller",
                  },
                },
              },
            }),
          ),
        ),
      )
    } finally {
      if (previousRuntimeDir === undefined) {
        delete process.env.KORRI_GAME_STREAM_RUNTIME_DIR
      } else {
        process.env.KORRI_GAME_STREAM_RUNTIME_DIR = previousRuntimeDir
      }
    }

    expect(dispatchedSpec?.command).toBe("moonlight")
    expect(dispatchedSpec?.env?.MOONLIGHT_LOCAL_CONTROL_AUTHORITY).toBe(
      "controller",
    )
    expect(dispatchedSpec?.env?.MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR).toContain(
      "/korri-moonlight/moonlight-",
    )
    expect(dispatchedSpec?.env?.MOONLIGHT_LOCAL_CONTROL_SESSION_ID).toStartWith(
      "moonlight-",
    )
    expect(dispatchedSpec?.env?.MOONLIGHT_LOCAL_CONTROL_SOCKET).toEndWith(
      "/control.sock",
    )
    expect(dispatchedSpec?.envUnset).toEqual(["OLD_ENV"])
  })

  it("passes wayland Moonlight remote-source policy through the generic launch path", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (_controlUrl, gameId) =>
              Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-wayland",
              }),
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
            localPolicy: {
              launchCompanions: {},
              moonlight: { platform: { name: "wayland" } },
            },
          }),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(dispatchedSpec?.args).toContain("wayland")
  })

  it("strips IPv6 brackets from the peer hostname when composing the moonlight spec", async () => {
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://[fe80::1234]:3001",
      isLocal: false,
    })

    await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (_controlUrl, gameId) =>
              Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-1",
              }),
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
          }),
        ),
      ),
    )

    expect(dispatchedSpec?.args).toContain("fe80::1234")
    expect(dispatchedSpec?.args.every(a => !a.includes("["))).toBe(true)
  })

  it("returns failed/host-unavailable when peer prepare fails", async () => {
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: () =>
              Effect.succeed({
                status: "failed" as const,
                category: "host-unavailable" as const,
                message: "peer is down",
              }),
            launchedSpec: () => {
              throw new Error("launcher should not run when peer prepare fails")
            },
          }),
        ),
      ),
    )

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.failureKind).toBe("host-unavailable")
      expect(result.stderrTail).toContain("aka")
      expect(result.stderrTail).toContain("peer is down")
    }
  })

  it("falls back to the next folded remote copy when peer prepare fails", async () => {
    const firstSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })
    const secondSource = new EntrySource({
      hostId: "zu",
      controlUrl: "http://zu.local:3001",
      isLocal: false,
    })
    const preparedFor: Array<{ controlUrl: string; gameId: string }> = []
    let dispatchedSpec:
      | { command: string; args: ReadonlyArray<string> }
      | undefined

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "aka/game",
        source: firstSource,
        launchAlternatives: [
          { id: "aka/game", releaseId: "default", source: firstSource },
          { id: "zu/game", releaseId: "default", source: secondSource },
        ],
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: (controlUrl, gameId) => {
              preparedFor.push({ controlUrl, gameId })
              if (controlUrl.includes("aka.local")) {
                return Effect.succeed({
                  status: "failed" as const,
                  category: "host-unavailable" as const,
                  message: "peer is down",
                })
              }
              return Effect.succeed({
                status: "prepared" as const,
                gameId,
                sessionId: "sess-fallback",
              })
            },
            launchedSpec: spec => {
              dispatchedSpec = spec
            },
          }),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(preparedFor).toEqual([
      { controlUrl: "http://aka.local:3001", gameId: "aka/game" },
      { controlUrl: "http://zu.local:3001", gameId: "zu/game" },
    ])
    expect(dispatchedSpec?.args).toContain("zu.local")
  })

  it("returns failed/host-control-disabled when peer prepare reports stream control off", async () => {
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: () =>
              Effect.succeed({
                status: "failed" as const,
                category: "host-control-disabled" as const,
                message: "stream control disabled",
              }),
            launchedSpec: () => {
              throw new Error("launcher should not run")
            },
          }),
        ),
      ),
    )

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.failureKind).toBe("host-control-disabled")
      expect(result.stderrTail).toContain("stream control")
    }
  })

  it("returns failed/host-unavailable when controlUrl is empty", async () => {
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "",
      isLocal: false,
    })

    let preparedCalled = false
    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: remoteSource,
      }).pipe(
        Effect.provide(
          remoteSourceTestLayer({
            prepare: () => {
              preparedCalled = true
              return Effect.succeed({
                status: "prepared" as const,
                gameId: "snes/echo.smc",
                sessionId: "sess-1",
              })
            },
            launchedSpec: () => {
              throw new Error("launcher should not run")
            },
          }),
        ),
      ),
    )

    expect(preparedCalled).toBe(false)
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.failureKind).toBe("host-unavailable")
      expect(result.stderrTail).toContain("controlUrl")
    }
  })

  it("propagates session-busy when the foreground session owner rejects a remote launch", async () => {
    // Remote launches dispatch the Moonlight streamer through the registry.
    process.env.KORRI_ENABLED_PLUGINS = "@korri:moonlight"
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const host = createForegroundSessionHost()
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: false,
    })
    const layer = Layer.mergeAll(
      localGameSourceLayer({ launchCompanions: {} }),
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
      Layer.succeed(ForegroundSessionHost)(host),
      makeInMemoryRemoteStreamPrepareLayer(() =>
        Effect.succeed({
          status: "prepared" as const,
          gameId: "game",
          sessionId: "sess-1",
        }),
      ),
    )

    const first = Effect.runPromise(
      handleLaunchLibrary({ id: "game", source: remoteSource }).pipe(
        Effect.provide(layer),
      ),
    )
    await waitForOwnerState(host, "Running")

    const second = await Effect.runPromise(
      handleLaunchLibrary({ id: "game", source: remoteSource }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(second).toMatchObject({
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    control.resolveExit({ exitCode: 0 })
    await first
    await host.owner.whenIdle()
  })

  it("returns { status: 'failed', exitCode } and includes argv echoed by fake-game.sh in stderrTail", async () => {
    const { layer } = await layerForFakeGame(7)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toContain("-Psnes")
      expect(result.stderrTail).toContain("--emulator=retroarch")
      expect(result.stderrTail).toContain("--emulator=retroarch")
    }
  })

  it("launches a directly resolved local playable without enumerating the full library", async () => {
    let listCalls = 0
    let launchedSpec: unknown
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () => {
        listCalls += 1
        return Effect.fail(
          new LibraryError({
            reason: "io",
            message: "list should not be on the launch critical path",
          }),
        )
      },
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: id =>
        Effect.succeed({
          spec: { command: "/bin/game", args: [id] },
          launchCompanions: {},
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: spec => {
        launchedSpec = spec
        return Effect.succeed({ status: "launched" as const })
      },
      spawn: spec => {
        launchedSpec = spec
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(listCalls).toBe(0)
    expect(launchedSpec).toEqual({ command: "/bin/game", args: ["game"] })
  })

  it("returns launch companion diagnostics before invoking the launcher", async () => {
    let launchedSpec: unknown
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/bin/game", args: ["rom"] },
          launchCompanions: {
            [wrapperProvider]: { enable: true },
          },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: spec => {
        launchedSpec = spec
        return Effect.succeed({ status: "launched" as const })
      },
      spawn: spec => {
        launchedSpec = spec
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toMatchObject({
      _tag: "LaunchFailed",
      status: "failed",
      exitCode: 124,
      stderrTail: expect.stringContaining(wrapperProvider),
    })
    expect(launchedSpec).toBeUndefined()
  })

  it("forwards launcher-anchor extras from ResolvedLaunch to the launcher (task-014 AC #2)", async () => {
    // The library source decides whether a resolved launch is a
    // launcher-anchor app and supplies the lifecycle/wait extras.
    // Sessiond-backed launchers consume them via
    // `LauncherService.spawn(spec, options.extras)`. This test pins
    // the plumbing: extras supplied on the source's ResolvedLaunch
    // reach the launcher unchanged.
    let capturedExtras: unknown = "not-called"
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/usr/bin/steam", args: ["steam://rungameid/3"] },
          // Steam is the canonical launcher-anchor app: the steam
          // process exits while the actual game lifecycle continues
          // under its supervision. Sessiond's session-lifecycle mode
          // is designed for exactly this shape — launcher-exited
          // events drive the role-foreground anchor.
          extras: { lifecycle: "session" as const },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: () => Effect.succeed({ status: "failed" as const, exitCode: 1 }),
      spawn: (_spec, options) => {
        capturedExtras = options?.extras
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(capturedExtras).toEqual({
      lifecycle: "session",
      launchId: expect.any(String),
    })
  })

  it("forwards provider launch metadata to managed session cleanup", async () => {
    let capturedExtras: unknown = "not-called"
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/usr/bin/steam", args: ["-applaunch", "1029210"] },
          launchMetadata: {
            appProviderId: "@korri:steam",
            annotations: {
              "@korri:steam": {
                steamSession: true,
                foregroundCleanup: { appId: "1029210" },
              },
            },
          },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: () => Effect.succeed({ status: "failed" as const, exitCode: 1 }),
      spawn: (_spec, options) => {
        capturedExtras = options?.extras
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(capturedExtras).toEqual({
      launchId: expect.any(String),
      launchMetadata: {
        appProviderId: "@korri:steam",
        annotations: {
          "@korri:steam": {
            steamSession: true,
            foregroundCleanup: { appId: "1029210" },
          },
        },
      },
    })
  })

  it("opens Steam lifecycle correlation before managed launch spawn", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"
    const observer = createSteamLogObserver({ logDir: "/tmp/steam/logs" })
    installSteamLogObserverStatus(
      Symbol("steam-correlation-test"),
      observer.status,
      {
        openCorrelation: observer.openCorrelation,
        collectLifecycle: observer.collectLifecycle,
      },
    )

    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "thirty-xx", system: "steam", contentPath: "" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/usr/bin/steam", args: ["-applaunch", "1029210"] },
          launchMetadata: {
            appProviderId: "@korri:steam",
            annotations: {
              "@korri:steam": {
                steamSession: true,
                foregroundCleanup: { appId: "1029210" },
              },
            },
          },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: () => Effect.succeed({ status: "failed" as const, exitCode: 1 }),
      spawn: (_spec, _options) =>
        Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        }),
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "thirty-xx" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    observer.ingestLine({
      source: "console_log",
      logFile: "console_log.txt",
      line: '[2026-06-14 14:38:41] GameAction [AppID 1029210, ActionID 2] : LaunchApp changed task to WaitingGameWindow with ""',
      observedAt: "2026-06-14T18:38:41.000Z",
      sequence: 1,
    })
    const lifecycle = observer.collectLifecycle({ appId: "1029210" })
    expect(lifecycle.events[0]).toMatchObject({
      appId: "1029210",
      playableId: "thirty-xx",
      launchId: expect.any(String),
    })
  })

  it("threads a caller-generated launch id when ResolvedLaunch has no extras", async () => {
    // The Steam lifecycle observer opens correlation before the sessiond
    // request, so even default foreground launches now carry a launchId.
    let capturedOptions: unknown = "not-called"
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/bin/game", args: [] },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: () => Effect.succeed({ status: "failed" as const, exitCode: 1 }),
      spawn: (_spec, options) => {
        capturedOptions = options
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(capturedOptions).toEqual({
      extras: { launchId: expect.any(String) },
    })
  })

  it("returns diagnostics for an unregistered launch companion provider", async () => {
    let launchedSpec: unknown
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/bin/game", args: ["rom"] },
          launchCompanions: {
            [wrapperProvider]: { backend: { type: "sdl" as const } },
          },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: spec => {
        launchedSpec = spec
        return Effect.succeed({ status: "launched" as const })
      },
      spawn: spec => {
        launchedSpec = spec
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toMatchObject({
      _tag: "LaunchFailed",
      status: "failed",
      exitCode: 124,
      stderrTail: expect.stringContaining(wrapperProvider),
    })
    expect(launchedSpec).toBeUndefined()
  })

  it("passes selected preset inputs and honors a direct-launch opt-out", async () => {
    let resolveInputs: unknown
    let launchedSpec: unknown
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: (_id, inputs) => {
        resolveInputs = inputs
        return Effect.succeed({
          spec: { command: "/bin/game", args: ["rom"] },
          launchCompanions: {},
        })
      },
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: spec => {
        launchedSpec = spec
        return Effect.succeed({ status: "launched" as const })
      },
      spawn: spec => {
        launchedSpec = spec
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game", presetId: "raw", appId: "steam" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result).toEqual({ _tag: "Accepted", status: "launched" })
    expect(resolveInputs).toEqual({
      userId: undefined,
      presetId: "raw",
      appId: "steam",
      override: undefined,
    })
    expect(launchedSpec).toEqual({ command: "/bin/game", args: ["rom"] })
  })

  it("returns accepted once a sessiond-managed local child is running", async () => {
    let resolveExit!: (result: { readonly exitCode: number }) => void
    const exit = new Promise<{ readonly exitCode: number }>(resolve => {
      resolveExit = resolve
    })
    const host = createForegroundSessionHost()
    const launcherLayer = Layer.succeed(Launcher)({
      run: () => Effect.succeed({ status: "launched" as const }),
      spawn: () =>
        Effect.succeed({
          status: "started" as const,
          result: exit.then(result =>
            result.exitCode === 0
              ? { status: "launched" as const }
              : { status: "failed" as const, exitCode: result.exitCode },
          ),
          session: {
            id: "sessiond-launch-1",
            exited: exit,
            ready: Promise.resolve({ status: "ok" as const }),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
    })
    const layer = Layer.mergeAll(
      localGameSourceLayer({ launchCompanions: {} }),
      launcherLayer,
      Layer.succeed(ForegroundSessionHost)(host),
      remoteStreamPrepareNeverCalledLayer,
    )

    const launch = Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )
    await waitForOwnerState(host, "Running")

    expect(await launch).toEqual({ _tag: "Accepted", status: "launched" })
    expect(host.owner.status().state._tag).toBe("Running")

    resolveExit({ exitCode: 0 })
    await host.owner.whenIdle()
  })

  it("rejects local launch re-entry as session-busy without spawning a second child", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const host = createForegroundSessionHost()
    const layer = Layer.mergeAll(
      localGameSourceLayer({ launchCompanions: {} }),
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
      Layer.succeed(ForegroundSessionHost)(host),
      remoteStreamPrepareNeverCalledLayer,
    )

    const first = Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )
    await waitForOwnerState(host, "Running")

    const second = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )

    expect(second).toMatchObject({
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    control.resolveExit({ exitCode: 0 })
    await first
    await host.owner.whenIdle()
  })

  it("preserves terminal failure diagnostics for managed children without readiness", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const host = createForegroundSessionHost()
    const layer = Layer.mergeAll(
      localGameSourceLayer({ launchCompanions: {} }),
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
      Layer.succeed(ForegroundSessionHost)(host),
      remoteStreamPrepareNeverCalledLayer,
    )

    const launch = Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )
    await waitForOwnerState(host, "Running")

    control.resolveExit({ exitCode: 7, stderrTail: "boom" })

    expect(await launch).toEqual({
      _tag: "LaunchFailed",
      status: "failed",
      exitCode: 7,
      stderrTail: "boom",
    })
    await host.owner.whenIdle()
  })

  it("returns failed launch diagnostics for a misconfigured profile (no spawn)", async () => {
    const lib = await withTempProseqlLibrary({ missingProfile: true })
    cleanups.push(lib.cleanup)
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.KORRI_CONFIG_ROOTS = lib.root
    const launcherLayer = Layer.succeed(Launcher)({
      run: () =>
        Effect.fail(
          new LibraryError({
            reason: "io",
            message: "launcher should not run for configuration failures",
          }),
        ),
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            LibrarySourceLayerLive,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
            remoteStreamPrepareNeverCalledLayer,
          ),
        ),
      ),
    )

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(124)
      expect(result.stderrTail).toContain("AppNotFound")
    }
  })

  it("fails with NotFoundError for unknown id (no spawn)", async () => {
    const { layer } = await layerForFakeGame(0)
    const exit = await Effect.runPromiseExit(
      handleLaunchLibrary({ id: "snes/does-not-exist.smc" }).pipe(
        Effect.provide(layer),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(NotFoundError)
    }
  })

  it("integration: the launch RPC's tag is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.launch")
  })
})

/**
 * Layer-builder for remote-source dispatch tests.
 *
 * - `prepare`: stubs the peer's `app.server.stream.prepare` response.
 * - `launchedSpec`: side-channel for asserting the LaunchSpec dispatched
 *   to the launcher service (the spec is the wire-shape the kiosk's
 *   sessiond will receive).
 */
function remoteSourceTestLayer(options: {
  readonly prepare: RemoteStreamPrepareService["prepare"]
  readonly launchedSpec: (spec: {
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly env?: Readonly<Record<string, string>>
    readonly envUnset?: readonly string[]
  }) => void
  readonly localPolicy?: ResolvedLocalLauncherPolicy
  readonly launchedExtras?: (extras: unknown) => void
}) {
  // Remote-source launches dispatch the Moonlight streamer through the registry.
  process.env.KORRI_ENABLED_PLUGINS = "@korri:moonlight"
  const sourceLayer = Layer.succeed(LibrarySource)({
    list: () =>
      Effect.succeed([
        { id: "snes/echo.smc", system: "snes", contentPath: "" },
      ]),
    launchSpecFor: () =>
      Effect.fail(
        new LibraryError({
          reason: "config",
          message: "remote-source: launchSpecFor not used",
        }),
      ),
    resolveLaunchForGame: () =>
      Effect.fail(
        new LibraryError({
          reason: "config",
          message: "remote-source: resolveLaunchForGame not used",
        }),
      ),
    resolveLocalLauncherPolicy: () =>
      Effect.succeed(
        options.localPolicy ?? {
          launchCompanions: {},
        },
      ),
  })
  const launcherLayer = Layer.succeed(Launcher)({
    run: spec => {
      options.launchedSpec(spec)
      return Effect.succeed({ status: "launched" as const })
    },
    spawn: (spec, spawnOptions) => {
      options.launchedSpec(spec)
      options.launchedExtras?.(spawnOptions?.extras)
      return Effect.succeed({
        status: "started" as const,
        result: Promise.resolve({ status: "launched" as const }),
        session: completedSessionHandle(),
      })
    },
  })
  return Layer.mergeAll(
    sourceLayer,
    launcherLayer,
    Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
    makeInMemoryRemoteStreamPrepareLayer(options.prepare),
  )
}

function makeInMemoryRemoteStreamPrepareLayer(
  prepare: RemoteStreamPrepareService["prepare"],
) {
  return Layer.succeed(RemoteStreamPrepare)({ prepare })
}

const remoteStreamPrepareNeverCalledLayer = Layer.succeed(RemoteStreamPrepare)({
  prepare: () =>
    Effect.die(
      "remote-stream-prepare invoked from a test that should not hit the remote branch",
    ),
})

function completedSessionHandle() {
  return {
    id: "completed-local-child",
    processId: 123,
    exited: Promise.resolve({ exitCode: 0 }),
    terminate: () => {},
    terminateNow: () => {},
  }
}

function localGameSourceLayer(options: {
  readonly launchCompanions: Readonly<Record<string, unknown>>
}) {
  return Layer.succeed(LibrarySource)({
    list: () =>
      Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
    launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
    resolveLaunchForGame: () =>
      Effect.succeed({
        spec: { command: "/bin/game", args: ["rom"] },
        launchCompanions: options.launchCompanions,
      }),
    resolveLocalLauncherPolicy: () =>
      Effect.succeed({
        launchCompanions: options.launchCompanions,
      }),
  })
}

async function waitForOwnerState(
  host: ReturnType<typeof createForegroundSessionHost>,
  state: ForegroundSessionState["_tag"],
) {
  for (let index = 0; index < 20; index += 1) {
    if (host.owner.status().state._tag === state) return
    await Promise.resolve()
  }
  expect(host.owner.status().state._tag).toBe(state)
}

type TempProseqlLibrary = {
  readonly root: string
  readonly cleanup: () => Promise<void>
}

async function withTempProseqlLibrary(
  options: { readonly missingProfile?: boolean } = {},
): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-launch-test-"))
  let success = false
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)
          yield* repository.upsertGlobalConfig({
            launch: { with: {} },
          })
          yield* repository.upsertGame({
            id: "snes/echo.smc",
            system: "snes",
            contentPath: "/tmp/roms/snes/echo.smc",
            launch: { app: "rocknix-retroarch" },
            metadata: { name: "Echo" },
          })
          yield* repository.upsertSystem({
            id: "snes",
          })
          if (!options.missingProfile) {
            yield* repository.upsertLauncher({
              id: "rocknix-retroarch",
              command: FAKE_GAME,
              args: ["{content.path}", "-P{system}", "--emulator=retroarch"],
              systems: ["snes"],
            })
          }
          yield* Effect.promise(() => db.flush())
        }),
      ),
    )
    await mirrorLibraryAsConfigFragment(root)
    success = true
  } finally {
    if (!success) await rm(root, { recursive: true, force: true })
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
