import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Cause, Effect, Exit } from "effect"

export type LauncherConfigValidationResult =
  | {
      readonly status: "resolved"
      readonly gameId: string
      readonly spec: {
        readonly command: string
        readonly args: readonly string[]
        readonly env?: Readonly<Record<string, string>>
        readonly cwd?: string
      }
    }
  | {
      readonly status: "diagnostic"
      readonly gameId: string
      readonly reason: string
      readonly message: string
    }

export async function validateLauncherConfig(args: {
  readonly root: string
  readonly gameId: string
}): Promise<LauncherConfigValidationResult> {
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: args.root,
          writeDebounce: 1,
        })
        const repository = createLibraryRepository(db)
        return yield* repository.launchSpecForGame(args.gameId)
      }),
    ),
  )

  if (Exit.isSuccess(exit)) {
    const spec = exit.value
    if (!spec) {
      return {
        status: "diagnostic",
        gameId: args.gameId,
        reason: "MissingLaunchTarget",
        message: `No launch target exists for game ${args.gameId}`,
      }
    }
    return { status: "resolved", gameId: args.gameId, spec }
  }

  const error = Cause.squash(exit.cause)
  return {
    status: "diagnostic",
    gameId: args.gameId,
    reason: "LaunchResolutionFailed",
    message: error instanceof Error ? error.message : String(error),
  }
}

export async function runLauncherConfigCli(
  argv: readonly string[],
  output: (line: string) => void = line => console.log(line),
): Promise<number> {
  const parsed = parseArgs(argv)
  if (!parsed) {
    output(
      "Usage: bun tools/library/launcher-config-cli.ts --root <library-root> --game-id <game-id>",
    )
    return 2
  }

  const result = await validateLauncherConfig(parsed)
  output(JSON.stringify(result, null, 2))
  return result.status === "resolved" ? 0 : 1
}

function parseArgs(
  argv: readonly string[],
): { readonly root: string; readonly gameId: string } | undefined {
  const root = valueAfter(argv, "--root")
  const gameId = valueAfter(argv, "--game-id")
  if (!root || !gameId) return undefined
  return { root, gameId }
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined
  const value = argv[index + 1]
  return value && !value.startsWith("--") ? value : undefined
}

if (import.meta.main) {
  const exitCode = await runLauncherConfigCli(Bun.argv.slice(2))
  process.exit(exitCode)
}
