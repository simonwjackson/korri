import { BunRuntime, BunServices } from "@effect/platform-bun"
import { makeLiveAcquisitionLayer } from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { KorriControl } from "@platform/control/korri-control"
import { KorriControlLayerLiveWithPlugins } from "@platform/control/korri-control-live"
import { LauncherLayerLive } from "@platform/library/launcher-layer-live"
import { LibrarySource } from "@platform/library/library-services"
import { createKorriControlRpc } from "@product/apps/portal/control/korri-control-rpc"
import { createEvierStreamControlRpcClient } from "@product/apps/portal/features/evier/stream-control-rpc-client"
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "@product/plugin-host/acquisition"
import { PluginLibrarySourceLayerLive } from "@product/plugin-host/library-source-layer"
import { createFirstPartyPluginState } from "@product/plugin-host/state"
import { Effect, Layer, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { artifactCommand } from "./artifacts/artifact-import-command"
import { bazzarCommand } from "./bazzar/bazzar-command"
import {
  dryRunLaunchExitCode,
  gameFindExitCode,
  gamesListExitCode,
  renderDryRunLaunch,
  renderFindGame,
  renderGamesList,
  renderSessionStatus,
  renderStopSession,
  sessionStatusExitCode,
  sessionStopExitCode,
} from "./control-renderers"
import {
  createEffectConfirmPrompt,
  createEffectGamePicker,
  createEffectReleasePicker,
} from "./game-picker"
import { runLaunchCommand } from "./launch-command"
import { scoutCommand } from "./scout-command"
import {
  parseResolution,
  runStreamAdaptiveSet,
  runStreamAdaptiveShow,
  runStreamAdaptiveWatch,
  runStreamSet,
  runStreamShow,
} from "./stream-quality"

const VERSION = "1.0.0"

const streamSocketFlag = Flag.string("socket").pipe(Flag.optional)
const streamBoundaryFlags = {
  bitrate: Flag.string("bitrate").pipe(Flag.optional),
  fps: Flag.string("fps").pipe(Flag.optional),
  resolution: Flag.string("resolution").pipe(Flag.optional),
  lean: Flag.string("lean").pipe(Flag.optional),
  auto: Flag.string("auto").pipe(Flag.optional),
  maxLatency: Flag.string("max-latency").pipe(Flag.optional),
  minFps: Flag.string("min-fps").pipe(Flag.optional),
}
const streamAdaptiveFlags = {
  ...streamBoundaryFlags,
  dryRun: Flag.boolean("dry-run").pipe(Flag.withDefault(false)),
  watch: Flag.boolean("watch").pipe(Flag.withDefault(false)),
  json: Flag.boolean("json").pipe(Flag.withDefault(false)),
}

const streamShowCommand = Command.make(
  "show",
  { socket: streamSocketFlag },
  ({ socket }) =>
    Effect.gen(function* () {
      const exitCode = yield* Effect.promise(() =>
        runStreamShow(streamQualityIo(socket)),
      )
      process.exitCode = exitCode
    }),
).pipe(
  Command.withDescription(
    "Show the running stream's current bitrate, FPS, and resolution.",
  ),
)

const streamBitrateCommand = Command.make(
  "bitrate",
  { kbps: Argument.integer("kbps"), socket: streamSocketFlag },
  ({ kbps, socket }) =>
    Effect.gen(function* () {
      if (kbps <= 0) {
        console.error("bitrate must be a positive number of kbps")
        process.exitCode = 2
        return
      }
      const exitCode = yield* Effect.promise(() =>
        runStreamSet(
          { kind: "bitrate", bitrateKbps: kbps },
          streamQualityIo(socket),
        ),
      )
      process.exitCode = exitCode
    }),
).pipe(Command.withDescription("Set the running stream's bitrate in kbps."))

const streamFpsCommand = Command.make(
  "fps",
  { fps: Argument.integer("fps"), socket: streamSocketFlag },
  ({ fps, socket }) =>
    Effect.gen(function* () {
      if (fps <= 0) {
        console.error("fps must be a positive number")
        process.exitCode = 2
        return
      }
      const exitCode = yield* Effect.promise(() =>
        runStreamSet({ kind: "fps", fps }, streamQualityIo(socket)),
      )
      process.exitCode = exitCode
    }),
).pipe(Command.withDescription("Set the running stream's frame rate."))

const streamResolutionCommand = Command.make(
  "resolution",
  { size: Argument.string("WIDTHxHEIGHT"), socket: streamSocketFlag },
  ({ size, socket }) =>
    Effect.gen(function* () {
      const parsed = parseResolution(size)
      if (!parsed) {
        console.error("resolution must be WIDTHxHEIGHT, e.g. 1280x720")
        process.exitCode = 2
        return
      }
      const exitCode = yield* Effect.promise(() =>
        runStreamSet(
          { kind: "resolution", width: parsed.width, height: parsed.height },
          streamQualityIo(socket),
        ),
      )
      process.exitCode = exitCode
    }),
).pipe(
  Command.withDescription(
    "Set the running stream's resolution, e.g. 1280x720.",
  ),
)

const streamCommand = Command.make(
  "stream",
  { socket: streamSocketFlag, ...streamAdaptiveFlags },
  ({ socket: _socket, dryRun, watch, json, ...flags }) =>
    Effect.gen(function* () {
      const args = streamAdaptiveArgs(flags)
      const client = createEvierStreamControlRpcClient()
      const exitCode = yield* Effect.promise(() =>
        args.length > 0
          ? runStreamAdaptiveSet(args, { client, dryRun, json })
          : watch
            ? runStreamAdaptiveWatch({ client, json })
            : runStreamAdaptiveShow({ client, json }),
      )
      process.exitCode = exitCode
    }),
).pipe(
  Command.withDescription(
    "Manage Korri game streaming. With --key=value flags, updates adaptive boundaries.",
  ),
  Command.withSubcommands([
    streamShowCommand,
    streamBitrateCommand,
    streamFpsCommand,
    streamResolutionCommand,
  ]),
)

function streamAdaptiveArgs(flags: {
  readonly bitrate: Option.Option<string>
  readonly fps: Option.Option<string>
  readonly resolution: Option.Option<string>
  readonly lean: Option.Option<string>
  readonly auto: Option.Option<string>
  readonly maxLatency: Option.Option<string>
  readonly minFps: Option.Option<string>
}): readonly string[] {
  return [
    optionArg("bitrate", flags.bitrate),
    optionArg("fps", flags.fps),
    optionArg("resolution", flags.resolution),
    optionArg("lean", flags.lean),
    optionArg("auto", flags.auto),
    optionArg("max-latency", flags.maxLatency),
    optionArg("min-fps", flags.minFps),
  ].filter((arg): arg is string => arg !== undefined)
}

function optionArg(
  key: string,
  option: Option.Option<string>,
): string | undefined {
  return Option.isSome(option) ? `${key}=${option.value}` : undefined
}

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
    gameId: Argument.string("game-id").pipe(Argument.optional),
    host: Flag.string("host").pipe(Flag.optional),
    releaseId: Flag.string("release-id").pipe(Flag.optional),
    appId: Flag.string("app-id").pipe(Flag.optional),
    profileId: Flag.string("profile-id").pipe(Flag.optional),
    yes: Flag.boolean("yes").pipe(Flag.withDefault(false)),
    ...streamBoundaryFlags,
  },
  ({ gameId, host, releaseId, appId, profileId, yes, ...flags }) =>
    Effect.gen(function* () {
      const control = yield* KorriControl
      const librarySource = yield* LibrarySource
      const exitCode = yield* Effect.promise(() =>
        runLaunchCommand({
          gameId: Option.getOrUndefined(gameId),
          host: Option.getOrUndefined(host),
          releaseId: Option.getOrUndefined(releaseId),
          appId: Option.getOrUndefined(appId),
          profileId: Option.getOrUndefined(profileId),
          streamBoundaryArgs: streamAdaptiveArgs(flags),
          confirmYes: yes,
          stdinIsTty: process.stdin.isTTY === true,
          librarySource,
          launchLocal: request =>
            Effect.runPromise(control.launchGame(request)),
          sessionStatus: () => Effect.runPromise(control.sessionStatus()),
          gamePicker: createEffectGamePicker(),
          releasePicker: createEffectReleasePicker(),
          confirmPrompt: createEffectConfirmPrompt(),
        }),
      )
      process.exitCode = exitCode
    }),
).pipe(
  Command.withDescription(
    "Launch a Korri library game locally, or by streaming from another machine.",
  ),
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

export const korriCommand = Command.make("korri").pipe(
  Command.withDescription("Korri command line interface."),
  Command.withSubcommands([
    artifactCommand,
    bazzarCommand,
    gamesCommand,
    launchCommand,
    scoutCommand,
    sessionCommand,
    streamCommand,
  ]),
)

const AcquisitionLayerLive = makeLiveAcquisitionLayer({
  registry: createStaticAcquisitionPluginRegistry(
    createFirstPartyAcquisitionPluginDefinitionsFromEnv(process.env),
  ),
})

const KorriControlInfrastructureLive = KorriControlLayerLiveWithPlugins(
  createFirstPartyPluginState({ mode: "interactive" }).registry,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(PluginLibrarySourceLayerLive, LauncherLayerLive),
  ),
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

function streamQualityIo(socket: Option.Option<string>) {
  return Option.isSome(socket) ? { socketPath: socket.value } : {}
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
