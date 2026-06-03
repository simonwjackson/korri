import { BunRuntime, BunServices } from "@effect/platform-bun"
import { LauncherLayerLive } from "@shared/library/launcher-layer-live"
import { Launcher, LibrarySource } from "@shared/library/library-services"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { Effect, Layer, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import {
  createFileGameStreamLaunchIntentStore,
  defaultGameStreamIntentPath,
} from "../../services/device/game-stream-launch-intent"
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
      const exitCode = yield* Effect.promise(() =>
        runRemoteStreamLaunchCommand({
          host: Option.getOrUndefined(host),
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
  Command.withSubcommands([playCommand, streamCommand]),
)

const runtimeLayer = Layer.mergeAll(
  BunServices.layer,
  LibrarySourceLayerLive,
  LauncherLayerLive,
)

export function runKorriCli(argv: readonly string[]) {
  return Command.runWith(korriCommand, { version: VERSION })(argv).pipe(
    Effect.provide(runtimeLayer),
  )
}

if (import.meta.main) {
  Command.run(korriCommand, { version: VERSION }).pipe(
    Effect.provide(runtimeLayer),
    BunRuntime.runMain,
  )
}
