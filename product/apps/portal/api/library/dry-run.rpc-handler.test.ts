import { describe, expect, it } from "bun:test"
import {
  KorriControl,
  type KorriControlService,
} from "@platform/control/korri-control"
import { Effect, Layer } from "effect"
import { handleDryRunLaunch } from "./dry-run.rpc-handler"

describe("app.library.launch.dry-run handler", () => {
  it("delegates launch resolution to KorriControl without launching", async () => {
    const calls: unknown[] = []
    const result = await Effect.runPromise(
      handleDryRunLaunch({ id: "snes/echo.smc", profileId: "default" }).pipe(
        Effect.provide(
          controlLayer({
            dryRunLaunch: request => {
              calls.push(request)
              return Effect.succeed({
                _tag: "LaunchDryRunOk",
                selection: { id: request.id, profileId: request.profileId },
                spec: { command: "echo", args: ["hello"] },
                readiness: { _tag: "SessionReady", mode: "idle" },
                caveats: [],
              })
            },
          }),
        ),
      ),
    )

    expect(calls).toEqual([{ id: "snes/echo.smc", profileId: "default" }])
    expect(result).toEqual({
      _tag: "LaunchDryRunOk",
      selection: { id: "snes/echo.smc", profileId: "default" },
      spec: { command: "echo", args: ["hello"] },
      readiness: { _tag: "SessionReady", mode: "idle" },
      caveats: [],
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
