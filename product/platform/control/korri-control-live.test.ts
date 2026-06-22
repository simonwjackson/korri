import { describe, expect, it } from "bun:test"
import type { LaunchResult, LaunchSpec } from "@platform/library/launcher"
import {
  LibraryError,
  type LibrarySourceService,
  type ResolvedLaunch,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import type { ControlLaunchResult } from "./control-results"
import { makeKorriControlLive } from "./korri-control-live"

const spec: LaunchSpec = { command: "echo", args: ["hello"] }
const playable: PlayableLibraryEntry = {
  id: "snes/echo.smc",
  itemId: "snes/echo.smc",
  title: "Echo Runner",
  launchable: true,
  releases: [{ id: "default", system: "snes", launchable: true }],
}

describe("KorriControl live implementation", () => {
  it("lists and finds playable entries from LibrarySource.listPlayableEntries", async () => {
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
    })

    await expect(Effect.runPromise(control.listGames({}))).resolves.toEqual({
      _tag: "GamesListed",
      games: [playable],
    })
    await expect(
      Effect.runPromise(control.findGame({ query: "snes/echo.smc" })),
    ).resolves.toMatchObject({ _tag: "GameFound", match: "exact-id" })
  })

  it("reports unavailable lists when the library source fails", async () => {
    const control = makeKorriControlLive({
      librarySource: {
        ...librarySource(),
        listPlayableEntries: () =>
          Effect.fail(
            new LibraryError({
              reason: "config",
              message: "",
              diagnostic: "not configured",
            }),
          ),
      },
      launcher: launcher(),
    })

    await expect(Effect.runPromise(control.listGames({}))).resolves.toEqual({
      _tag: "ListGamesUnavailable",
      message: "not configured",
    })
    await expect(
      Effect.runPromise(control.findGame({ query: playable.id })),
    ).resolves.toEqual({ _tag: "HostUnavailable", message: "not configured" })
  })

  it("dry-runs launch resolution without invoking the launcher", async () => {
    let runCount = 0
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher({ onRun: () => runCount++ }),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async () =>
          Response.json({
            schemaVersion: 1,
            mode: "idle",
            capabilities: {
              managedLaunch: true,
              lifecycleEvents: true,
              perLaunchTermination: true,
            },
            restoreAttempts: 0,
          }),
      },
    })

    const result = await Effect.runPromise(
      control.dryRunLaunch({ id: "snes/echo.smc", profileId: "default" }),
    )

    expect(result).toMatchObject({
      _tag: "LaunchDryRunOk",
      selection: { id: "snes/echo.smc", profileId: "default" },
      spec,
      readiness: { _tag: "SessionReady", mode: "idle" },
    })
    expect(runCount).toBe(0)
  })

  it("runs launch.prepare in check mode for dry-run without invoking the launcher", async () => {
    const calls: unknown[] = []
    let runCount = 0
    const preparePlugin = plugin({
      namespace: "@fixture",
      name: "prepare",
      contributes: {
        handlers: [
          {
            id: "prepare.launch-prepare",
            operation: "launch.prepare",
            capabilities: ["launch.prepare"],
            run: context => {
              calls.push(context.input)
              return undefined
            },
          },
        ],
      },
    })
    const control = makeKorriControlLive({
      librarySource: librarySource({
        launchPrepare: { "@fixture:prepare": { profileId: 37 } },
      }),
      launcher: launcher({ onRun: () => runCount++ }),
      pluginRegistry: createPluginRegistry([preparePlugin], {
        enabledPluginIds: ["@fixture:prepare"],
      }),
    })

    await expect(
      Effect.runPromise(control.dryRunLaunch({ id: playable.id })),
    ).resolves.toMatchObject({ _tag: "LaunchDryRunOk" })
    expect(runCount).toBe(0)
    expect(calls).toEqual([
      {
        spec,
        policy: { profileId: 37 },
        mode: "check",
      },
    ])
  })

  it("runs launch.prepare in commit mode before spawning a launch", async () => {
    const calls: unknown[] = []
    const launchedSpecs: LaunchSpec[] = []
    const preparePlugin = plugin({
      namespace: "@fixture",
      name: "prepare",
      contributes: {
        handlers: [
          {
            id: "prepare.launch-prepare",
            operation: "launch.prepare",
            capabilities: ["launch.prepare"],
            run: context => {
              calls.push(context.input)
              return { spec: { command: "prepared", args: [] } }
            },
          },
        ],
      },
    })
    const control = makeKorriControlLive({
      librarySource: librarySource({
        launchPrepare: { "@fixture:prepare": { profileId: 37 } },
      }),
      launcher: {
        run: launchSpec => {
          launchedSpecs.push(launchSpec)
          return Effect.succeed({ status: "launched" as const })
        },
      },
      pluginRegistry: createPluginRegistry([preparePlugin], {
        enabledPluginIds: ["@fixture:prepare"],
      }),
    })

    await expect(
      Effect.runPromise(control.launchGame({ id: playable.id })),
    ).resolves.toEqual({ _tag: "Launched", selection: { id: playable.id } })
    expect(calls).toEqual([
      {
        spec,
        policy: { profileId: 37 },
        mode: "commit",
      },
    ])
    expect(launchedSpecs).toEqual([{ command: "prepared", args: [] }])
  })

  it("forwards resolved launch metadata and companions through managed launcher spawn", async () => {
    const spawns: unknown[] = []
    const companionPlugin = plugin({
      namespace: "@fixture",
      name: "companion",
      contributes: {
        handlers: [
          {
            id: "companion.launch-compose",
            operation: "launch.compose",
            capabilities: ["launch.compose"],
            run: context => (context.input as { readonly spec: LaunchSpec }).spec,
          },
        ],
      },
    })
    const control = makeKorriControlLive({
      librarySource: librarySource({
        launchMetadata: {
          annotations: { "@fixture:input": { enable: true } },
        },
        launchCompanions: {
          "@fixture:companion": { enable: true, mode: "wrapped" },
        },
      }),
      launcher: {
        run: () => Effect.succeed({ status: "launched" as const }),
        spawn: (launchSpec, options?) => {
          spawns.push({ launchSpec, options })
          return Effect.succeed({
            status: "started" as const,
            session: {
              id: "session-1",
              exited: Promise.resolve({ exitCode: 0 }),
              terminate: () => undefined,
              terminateNow: () => undefined,
            },
            result: Promise.resolve({ status: "launched" as const }),
          })
        },
      },
      pluginRegistry: createPluginRegistry([companionPlugin], {
        enabledPluginIds: ["@fixture:companion"],
      }),
    })

    await expect(
      Effect.runPromise(control.launchGame({ id: playable.id })),
    ).resolves.toEqual({ _tag: "Launched", selection: { id: playable.id } })
    expect(spawns).toEqual([
      {
        launchSpec: spec,
        options: {
          extras: {
            launchMetadata: {
              annotations: { "@fixture:input": { enable: true } },
            },
            launchCompanions: {
              "@fixture:companion": { enable: true, mode: "wrapped" },
            },
            launchId: expect.any(String),
          },
        },
      },
    ])
  })

  it("blocks launch when launch.prepare returns diagnostics", async () => {
    let runCount = 0
    const control = makeKorriControlLive({
      librarySource: librarySource({
        launchPrepare: { "@fixture:missing": {} },
      }),
      launcher: launcher({ onRun: () => runCount++ }),
      pluginRegistry: createPluginRegistry([]),
    })

    await expect(
      Effect.runPromise(control.launchGame({ id: playable.id })),
    ).resolves.toMatchObject({
      _tag: "LaunchConfigFailed",
      message: "Launch prepare provider @fixture:missing is not registered",
    })
    expect(runCount).toBe(0)
  })

  it("reports session status from sessiond probes", async () => {
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async () =>
          Response.json({
            schemaVersion: 1,
            mode: "game",
            capabilities: {
              managedLaunch: true,
              lifecycleEvents: true,
              perLaunchTermination: true,
            },
            active: { launchId: "launch-1", mode: "game", phase: "running" },
            failureReason: "previous failure",
            restoreAttempts: 1,
          }),
      },
    })

    await expect(Effect.runPromise(control.sessionStatus())).resolves.toEqual({
      _tag: "SessionStatus",
      configured: true,
      mode: "game",
      active: { launchId: "launch-1", mode: "game", phase: "running" },
      restoreAttempts: 1,
      failureReason: "previous failure",
    })
  })

  it("distinguishes sessiond not configured from idle session status", async () => {
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: { env: {} },
    })

    await expect(Effect.runPromise(control.sessionStatus())).resolves.toEqual({
      _tag: "SessiondNotConfigured",
    })
  })

  it("reports host unavailable for invalid sessiond status payloads", async () => {
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async () => Response.json({ nope: true }),
      },
    })

    await expect(
      Effect.runPromise(control.sessionStatus()),
    ).resolves.toMatchObject({ _tag: "HostUnavailable" })
  })

  it("maps local launch results into shared control launch variants", async () => {
    const cases: Array<{
      readonly result: LaunchResult
      readonly expected: ControlLaunchResult
    }> = [
      {
        result: { status: "launched" },
        expected: { _tag: "Launched", selection: { id: playable.id } },
      },
      {
        result: {
          status: "failed",
          exitCode: 121,
          failureKind: "session-busy",
          stderrTail: "busy",
        },
        expected: {
          _tag: "DaemonRejected",
          selection: { id: playable.id },
          message: "busy",
        },
      },
      {
        result: {
          status: "failed",
          exitCode: 124,
          failureKind: "host-unavailable",
        },
        expected: {
          _tag: "HostUnavailable",
          selection: { id: playable.id },
          message: "host control is unavailable",
        },
      },
      {
        result: {
          status: "failed",
          exitCode: 126,
          failureKind: "host-control-disabled",
        },
        expected: {
          _tag: "HostUnavailable",
          selection: { id: playable.id },
          message: "host control is unavailable",
        },
      },
      {
        result: {
          status: "failed",
          exitCode: 1,
          failureKind: "command-failed",
          stderrTail: "boom",
        },
        expected: {
          _tag: "LaunchFailed",
          selection: { id: playable.id },
          exitCode: 1,
          failureKind: "command-failed",
          stderrTail: "boom",
        },
      },
    ]

    for (const scenario of cases) {
      const control = makeKorriControlLive({
        librarySource: librarySource(),
        launcher: launcher({ result: scenario.result }),
      })
      await expect(
        Effect.runPromise(control.launchGame({ id: playable.id })),
      ).resolves.toEqual(scenario.expected)
    }
  })

  it("requires explicit confirmation before stopping a session", async () => {
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
    })

    await expect(
      Effect.runPromise(control.stopSession({ force: true })),
    ).resolves.toEqual({
      _tag: "ConfirmationRequired",
      action: "force-stop-session",
    })
  })

  it("does not terminate when a confirmed stop finds no active session", async () => {
    const requests: string[] = []
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async input => {
          requests.push(input)
          return Response.json({
            schemaVersion: 1,
            mode: "idle",
            capabilities: {
              managedLaunch: true,
              lifecycleEvents: true,
              perLaunchTermination: true,
            },
            restoreAttempts: 0,
          })
        },
      },
    })

    await expect(
      Effect.runPromise(control.stopSession({ confirmed: true })),
    ).resolves.toEqual({ _tag: "NothingToStop" })
    expect(requests).toEqual(["http://sessiond/managed-launch/status"])
  })

  it("reports host unavailable when terminate fails after resolving an active session", async () => {
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async input => {
          if (input.endsWith("/managed-launch/status")) {
            return Response.json({
              schemaVersion: 1,
              mode: "game",
              capabilities: {
                managedLaunch: true,
                lifecycleEvents: true,
                perLaunchTermination: true,
              },
              active: { launchId: "launch-1", mode: "game" },
              restoreAttempts: 0,
            })
          }
          throw new Error("terminate offline")
        },
      },
    })

    await expect(
      Effect.runPromise(control.stopSession({ confirmed: true })),
    ).resolves.toMatchObject({
      _tag: "HostUnavailable",
      message: "sessiond unreachable: terminate offline",
    })
  })

  it("returns StopPending when terminate is accepted but cleanup is still active", async () => {
    const responses = [
      {
        schemaVersion: 1,
        mode: "game",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        active: { launchId: "steam-launch", mode: "game", phase: "running" },
        restoreAttempts: 0,
      },
      { status: "accepted", launchId: "steam-launch" },
      {
        schemaVersion: 1,
        mode: "restoring",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        active: {
          launchId: "steam-launch",
          mode: "restoring",
          phase: "restoring",
        },
        restoreAttempts: 0,
      },
    ]
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async () => Response.json(responses.shift()),
      },
      stopSessionSettlePolls: 1,
    })

    await expect(
      Effect.runPromise(control.stopSession({ confirmed: true })),
    ).resolves.toEqual({
      _tag: "StopPending",
      launchId: "steam-launch",
      force: false,
      mode: "restoring",
      phase: "restoring",
    })
  })

  it("resolves the active session on the host before terminate", async () => {
    const requests: Array<{ readonly input: string; readonly body?: string }> =
      []
    let statusPoll = 0
    const control = makeKorriControlLive({
      librarySource: librarySource(),
      launcher: launcher(),
      sessiond: {
        url: "http://sessiond",
        fetchImpl: async (input, init) => {
          requests.push({ input, body: init?.body?.toString() })
          if (input.endsWith("/managed-launch/status")) {
            statusPoll += 1
            return Response.json({
              schemaVersion: 1,
              mode: statusPoll === 1 ? "game" : "home",
              capabilities: {
                managedLaunch: true,
                lifecycleEvents: true,
                perLaunchTermination: true,
              },
              ...(statusPoll === 1
                ? { active: { launchId: "launch-1", mode: "game" } }
                : {}),
              restoreAttempts: 0,
            })
          }
          return Response.json({ status: "accepted", launchId: "launch-1" })
        },
      },
    })

    await expect(
      Effect.runPromise(control.stopSession({ force: true, confirmed: true })),
    ).resolves.toEqual({ _tag: "Stopped", launchId: "launch-1", force: true })
    expect(requests.map(request => request.input)).toEqual([
      "http://sessiond/managed-launch/status",
      "http://sessiond/managed-launch/terminate",
      "http://sessiond/managed-launch/status",
    ])
    expect(JSON.parse(requests[1].body ?? "{}")).toEqual({
      launchId: "launch-1",
      force: true,
    })
  })
})

function librarySource(
  options: Pick<
    ResolvedLaunch,
    "launchPrepare" | "launchMetadata" | "launchCompanions"
  > = {},
): LibrarySourceService {
  return {
    list: () => Effect.succeed([]),
    listPlayableEntries: () => Effect.succeed([playable]),
    launchSpecFor: () => Effect.succeed(spec),
    resolveLaunchForGame: id =>
      id === playable.id
        ? Effect.succeed({ spec, ...options })
        : Effect.fail(
            new LibraryError({ reason: "config", message: "not configured" }),
          ),
  }
}

function launcher(
  options: { readonly onRun?: () => void; readonly result?: LaunchResult } = {},
) {
  return {
    run: () => {
      options.onRun?.()
      return Effect.succeed(options.result ?? { status: "launched" as const })
    },
  }
}
