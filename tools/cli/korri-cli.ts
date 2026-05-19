import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

const VERSION = "1.0.0"

const streamLaunchCommand = Command.make("launch", {}, () => Effect.void).pipe(
  Command.withDescription("Prepare a Korri library game for streaming."),
)

const streamCommand = Command.make("stream").pipe(
  Command.withDescription("Manage Korri game streaming."),
  Command.withSubcommands([streamLaunchCommand]),
)

export const korriCommand = Command.make("korri").pipe(
  Command.withDescription("Korri command line interface."),
  Command.withSubcommands([streamCommand]),
)

export function runKorriCli(argv: readonly string[]) {
  return Command.runWith(korriCommand, { version: VERSION })(argv).pipe(
    Effect.provide(BunServices.layer),
  )
}

if (import.meta.main) {
  Command.run(korriCommand, { version: VERSION }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  )
}
