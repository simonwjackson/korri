import { BunRuntime, BunServices } from "@effect/platform-bun"
import { makeLiveAcquisitionLayer } from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { approvedTypeScriptPluginDefinitions } from "@platform/acquisition/plugins/approved"
import { KorriControl } from "@platform/control/korri-control"
import { KorriControlLayerLiveWithPlugins } from "@platform/control/korri-control-live"
import { LauncherLayerLive } from "@platform/library/launcher-layer-live"
import { Launcher, LibrarySource } from "@platform/library/library-services"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import { createKorriControlRpc } from "@product/apps/portal/control/korri-control-rpc"
import { createFirstPartyPluginRegistryFromEnv } from "@product/plugins"
import { Effect, Layer, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import {
  createFileGameStreamLaunchIntentStore,
  defaultGameStreamIntentPath,
} from "../../services/device/game-stream-launch-intent"
import { artifactCommand } from "./artifacts/artifact-import-command"
import { bazzarCommand } from "./bazzar/bazzar-command"
import {
  dryRunLaunchExitCode,
  gameFindExitCode,
  gamesListExitCode,
  launchGameExitCode,
  renderDryRunLaunch,
  renderFindGame,
  renderGamesList,
  renderLaunchGame,
  renderSessionStatus,
  renderStopSession,
  sessionStatusExitCode,
  sessionStopExitCode,
} from "./control-renderers"
import { createEffectGamePicker } from "./game-picker"
import { runRemoteStreamLaunchCommand } from "./remote-stream-launch"
import { runSourceAwarePlayCommand } from "./source-aware-play"
import { runStreamLaunchCommand } from "./stream-launch"

const VERSION = "1.0.0"

const streamLaunchCommand = Command.make(
  "launch",
  {
    gameId: Argument.string("game-id").pipe(Argument.optional),
  },
  ({ gameId }) =>
    Effect.gen(function* () {
      const librarySource = yield* LibrarySource
      let intentPath: string
      try {
        intentPath = defaultGameStreamIntentPath(process.env)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 6
        return
      }

      const exitCode = yield* Effect.promise(() =>
        runStreamLaunchCommand({
          gameId: Option.getOrUndefined(gameId),
          librarySource,
          intentStore: createFileGameStreamLaunchIntentStore(intentPath),
          intentPath,
          gamePicker: createEffectGamePicker(),
          stdinIsTty: process.stdin.isTTY === true,
        }),
      )
      process.exitCode = exitCode
    }),
).pipe(Command.withDescription("Prepare a Korri library game for streaming."))

const streamRemoteLaunchCommand = Command.make(
  "remote-launch",
  {
    host: Flag.string("host").pipe(Flag.optional),
  },
  ({ host }) =>
    Effect.gen(function* () {
      const librarySource = yield* LibrarySource
      const exitCode = yield* Effect.promise(() =>
        runRemoteStreamLaunchCommand({
          host: Option.getOrUndefined(host),
          librarySource,
          gamePicker: createEffectGamePicker(),
          stdinIsTty: process.stdin.isTTY === true,
        }),
      )
      process.exitCode = exitCode
    }),
).pipe(
  Command.withDescription(
    "Discover a remote Korri stream host, prepare a game, and open Moonlight.",
  ),
)

const streamCommand = Command.make("stream").pipe(
  Command.withDescription("Manage Korri game streaming."),
  Command.withSubcommands([streamLaunchCommand, streamRemoteLaunchCommand]),
)

const gamesListCommand = Command.make(
  "list",
  {
    host: Flag.string("host").pipe(Flag.optional),
  },
  ({ host }) =>
    Effect.gen(function* () {
      const control = yield* controlForHost(Option.getOrUndefined(host))
      const result = yield* control.listGames({})
      console.log(renderGamesList(result))
      process.exitCode = gamesListExitCode(result)
    }),
).pipe(Command.withDescription("List playable Korri library games."))

const gamesFindCommand = Command.make(
  "find",
  {
    query: Argument.string("query"),
    host: Flag.string("host").pipe(Flag.optional),
  },
  ({ query, host }) =>
    Effect.gen(function* () {
      const control = yield* controlForHost(Option.getOrUndefined(host))
      const result = yield* control.findGame({ query })
      console.log(renderFindGame(result))
      process.exitCode = gameFindExitCode(result)
    }),
).pipe(Command.withDescription("Find a playable game by id or title."))

const gamesCommand = Command.make("games").pipe(
  Command.withDescription("List and find Korri library games."),
  Command.withSubcommands([gamesListCommand, gamesFindCommand]),
)

const launchDryRunCommand = Command.make(
  "dry-run",
  {
    id: Argument.string("game-id"),
    host: Flag.string("host").pipe(Flag.optional),
    profileId: Flag.string("profile-id").pipe(Flag.optional),
    releaseId: Flag.string("release-id").pipe(Flag.optional),
    appId: Flag.string("app-id").pipe(Flag.optional),
  },
  ({ id, host, profileId, releaseId, appId }) =>
    Effect.gen(function* () {
      const control = yield* controlForHost(Option.getOrUndefined(host))
      const result = yield* control.dryRunLaunch({
        id,
        ...(Option.isSome(profileId) ? { profileId: profileId.value } : {}),
        ...(Option.isSome(releaseId) ? { releaseId: releaseId.value } : {}),
        ...(Option.isSome(appId) ? { appId: appId.value } : {}),
      })
      console.log(renderDryRunLaunch(result))
      process.exitCode = dryRunLaunchExitCode(result)
    }),
).pipe(
  Command.withDescription(
    "Resolve a launch and session readiness without spawning it.",
  ),
)

const launchCommand = Command.make(
  "launch",
  {
    id: Argument.string("game-id"),
    host: Flag.string("host").pipe(Flag.optional),
    profileId: Flag.string("profile-id").pipe(Flag.optional),
    releaseId: Flag.string("release-id").pipe(Flag.optional),
    appId: Flag.string("app-id").pipe(Flag.optional),
  },
  ({ id, host, profileId, releaseId, appId }) =>
    Effect.gen(function* () {
      const control = yield* controlForHost(Option.getOrUndefined(host))
      const result = yield* control.launchGame({
        id,
        ...(Option.isSome(profileId) ? { profileId: profileId.value } : {}),
        ...(Option.isSome(releaseId) ? { releaseId: releaseId.value } : {}),
        ...(Option.isSome(appId) ? { appId: appId.value } : {}),
      })
      console.log(renderLaunchGame(result))
      process.exitCode = launchGameExitCode(result)
    }),
).pipe(
  Command.withDescription("Launch a Korri library game."),
  Command.withSubcommands([launchDryRunCommand]),
)

const sessionStatusCommand = Command.make(
  "status",
  {
    host: Flag.string("host").pipe(Flag.optional),
  },
  ({ host }) =>
    Effect.gen(function* () {
      const control = yield* controlForHost(Option.getOrUndefined(host))
      const status = yield* control.sessionStatus()
      console.log(renderSessionStatus(status))
      process.exitCode = sessionStatusExitCode(status)
    }),
).pipe(
  Command.withDescription(
    "Show the foreground session lifecycle from sessiond.",
  ),
)

const sessionStopCommand = Command.make(
  "stop",
  {
    host: Flag.string("host").pipe(Flag.optional),
    force: Flag.boolean("force").pipe(Flag.withDefault(false)),
    yes: Flag.boolean("yes").pipe(Flag.withDefault(false)),
  },
  ({ host, force, yes }) =>
    Effect.gen(function* () {
      const control = yield* controlForHost(Option.getOrUndefined(host))
      const result = yield* control.stopSession({ force, confirmed: yes })
      console.log(renderStopSession(result))
      process.exitCode = sessionStopExitCode(result)
    }),
).pipe(
  Command.withDescription(
    "Stop the active foreground session. Requires --yes because this mutates host state.",
  ),
)

const sessionCommand = Command.make("session").pipe(
  Command.withDescription("Inspect and control the foreground session."),
  Command.withSubcommands([sessionStatusCommand, sessionStopCommand]),
)

const playCommand = Command.make(
  "play",
  {
    host: Flag.string("host").pipe(Flag.optional),
  },
  ({ host }) =>
    Effect.gen(function* () {
      const librarySource = yield* LibrarySource
      const launcher = yield* Launcher
      const exitCode = yield* Effect.promise(() =>
        runSourceAwarePlayCommand({
          host: Option.getOrUndefined(host),
          librarySource,
          launcher,
          gamePicker: createEffectGamePicker(),
          stdinIsTty: process.stdin.isTTY === true,
        }),
      )
      process.exitCode = exitCode
    }),
).pipe(
  Command.withDescription(
    "Choose a local or remote Korri game, then launch locally or stream remotely.",
  ),
)

export const korriCommand = Command.make("korri").pipe(
  Command.withDescription("Korri command line interface."),
  Command.withSubcommands([
    artifactCommand,
    bazzarCommand,
    gamesCommand,
    launchCommand,
    playCommand,
    sessionCommand,
    streamCommand,
  ]),
)

const AcquisitionLayerLive = makeLiveAcquisitionLayer({
  registry: createStaticAcquisitionPluginRegistry(
    approvedTypeScriptPluginDefinitions,
  ),
})

const KorriControlInfrastructureLive = KorriControlLayerLiveWithPlugins(
  createFirstPartyPluginRegistryFromEnv(process.env),
).pipe(
  Layer.provideMerge(Layer.mergeAll(LibrarySourceLayerLive, LauncherLayerLive)),
)

const runtimeLayer = Layer.mergeAll(
  BunServices.layer,
  AcquisitionLayerLive,
  KorriControlInfrastructureLive,
)

function controlForHost(host: string | undefined) {
  if (host) return Effect.succeed(createKorriControlRpc(host))
  return KorriControl
}

export function runKorriCli(argv: readonly string[]) {
  return Command.runWith(korriCommand, { version: VERSION })(argv).pipe(
    Effect.provide(runtimeLayer),
  )
}

export function runKorriCliWithLayer(
  argv: readonly string[],
  layer: Layer.Layer<KorriControl>,
) {
  return Command.runWith(korriCommand, { version: VERSION })(argv).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, layer)),
  )
}

if (import.meta.main) {
  Command.run(korriCommand, { version: VERSION }).pipe(
    Effect.provide(runtimeLayer),
    BunRuntime.runMain,
  )
}
