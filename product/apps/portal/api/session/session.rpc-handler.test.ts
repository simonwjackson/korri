import { describe, expect, it } from "bun:test"
import {
  KorriControl,
  type KorriControlService,
} from "@platform/control/korri-control"
import { Effect, Layer } from "effect"
import { handleFreezeSession } from "./freeze.rpc-handler"
import { handleSessionStatus } from "./status.rpc-handler"
import { handleStopSession } from "./stop.rpc-handler"
import { handleThawSession } from "./thaw.rpc-handler"

describe("app.session RPC handlers", () => {
  it("returns focused session lifecycle status from KorriControl", async () => {
    const result = await Effect.runPromise(
      handleSessionStatus({}).pipe(
        Effect.provide(
          controlLayer({
            sessionStatus: () =>
              Effect.succeed({
                _tag: "SessionStatus",
                configured: true,
                mode: "game",
                active: { launchId: "launch-1", mode: "game" },
                restoreAttempts: 1,
              }),
          }),
        ),
      ),
    )

    expect(result).toEqual({
      _tag: "SessionStatus",
      configured: true,
      mode: "game",
      active: { launchId: "launch-1", mode: "game" },
      restoreAttempts: 1,
    })
  })

  it("passes confirmed force-stop intent through to KorriControl", async () => {
    const calls: Array<unknown> = []
    const result = await Effect.runPromise(
      handleStopSession({ force: true, confirmed: true }).pipe(
        Effect.provide(
          controlLayer({
            stopSession: request => {
              calls.push(request)
              return Effect.succeed({
                _tag: "Stopped",
                launchId: "launch-1",
                force: request.force === true,
              })
            },
          }),
        ),
      ),
    )

    expect(calls).toEqual([{ force: true, confirmed: true }])
    expect(result).toEqual({
      _tag: "Stopped",
      launchId: "launch-1",
      force: true,
    })
  })

  it("passes pending stop results through from KorriControl", async () => {
    const result = await Effect.runPromise(
      handleStopSession({ confirmed: true }).pipe(
        Effect.provide(
          controlLayer({
            stopSession: () =>
              Effect.succeed({
                _tag: "StopPending",
                launchId: "launch-1",
                force: false,
                mode: "restoring",
                phase: "restoring",
              }),
          }),
        ),
      ),
    )

    expect(result).toEqual({
      _tag: "StopPending",
      launchId: "launch-1",
      force: false,
      mode: "restoring",
      phase: "restoring",
    })
  })

  it("passes freeze requests through to KorriControl and returns the outcome", async () => {
    const calls: Array<unknown> = []
    const result = await Effect.runPromise(
      handleFreezeSession({ launchId: "launch-1" }).pipe(
        Effect.provide(
          controlLayer({
            freezeSession: request => {
              calls.push(request)
              return Effect.succeed({
                _tag: "Frozen",
                launchId: "launch-1",
              })
            },
          }),
        ),
      ),
    )

    expect(calls).toEqual([{ launchId: "launch-1" }])
    expect(result).toEqual({ _tag: "Frozen", launchId: "launch-1" })
  })

  it("passes thaw requests through and preserves structured outcomes", async () => {
    const outcomes = [
      { _tag: "AlreadyThawed", launchId: "launch-1" },
      { _tag: "Unsupported", message: "launch cannot be frozen" },
      { _tag: "NothingActive" },
      { _tag: "SessiondNotConfigured" },
      { _tag: "HostUnavailable", message: "offline" },
    ] as const

    for (const outcome of outcomes) {
      const result = await Effect.runPromise(
        handleThawSession({}).pipe(
          Effect.provide(
            controlLayer({ thawSession: () => Effect.succeed(outcome) }),
          ),
        ),
      )
      expect(result).toEqual(outcome)
    }
  })

  it("surfaces missing confirmation as a structured no-mutation result", async () => {
    const result = await Effect.runPromise(
      handleStopSession({ force: true }).pipe(
        Effect.provide(
          controlLayer({
            stopSession: () =>
              Effect.succeed({
                _tag: "ConfirmationRequired",
                action: "force-stop-session",
              }),
          }),
        ),
      ),
    )

    expect(result).toEqual({
      _tag: "ConfirmationRequired",
      action: "force-stop-session",
    })
  })
})

function controlLayer(
  overrides: Partial<KorriControlService>,
): Layer.Layer<KorriControl> {
  return Layer.succeed(KorriControl)({
    listGames: () => Effect.succeed({ _tag: "GamesListed", games: [] }),
    findGame: () => Effect.succeed({ _tag: "MissingQuery" }),
    dryRunLaunch: request =>
      Effect.succeed({
        _tag: "GameNotFound",
        query: request.id,
        candidates: [],
      }),
    launchGame: request =>
      Effect.succeed({
        _tag: "GameNotFound",
        query: request.id,
        candidates: [],
      }),
    sessionStatus: () => Effect.succeed({ _tag: "SessiondNotConfigured" }),
    stopSession: () => Effect.succeed({ _tag: "NothingToStop" }),
    freezeSession: () => Effect.succeed({ _tag: "NothingActive" }),
    thawSession: () => Effect.succeed({ _tag: "NothingActive" }),
    daemonStatus: () =>
      Effect.succeed({
        _tag: "DaemonAvailable",
        serverId: "test",
        displayName: "Test",
      }),
    streamRuntimeSettingsStatus: () =>
      Effect.succeed({
        _tag: "StreamRuntimeSettingsUnavailable",
        message: "not configured",
      }),
    ...overrides,
  })
}
