import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartyLaunchIntegrationsForRegistry,
} from "@product/plugins"
import { Cause, Effect, Exit } from "effect"

export type LauncherConfigValidationResult =
  | {
      readonly status: "resolved"
      readonly gameId: string
      readonly spec: {
        readonly command: string
        readonly args: readonly string[]
        readonly env?: Readonly<Record<string, string | null>>
        readonly cwd?: string
      }
      readonly app?: {
        readonly id: string
        readonly integration: string
      }
      readonly module?: {
        readonly id: string
        readonly path?: string
      }
      readonly settings?: Readonly<Record<string, string | number | boolean>>
      readonly artifacts?: {
        readonly root: string
        readonly paths: Readonly<Record<string, string>>
      }
      readonly diagnostics?: readonly string[]
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
  readonly env?: Readonly<Record<string, string | undefined>>
}): Promise<LauncherConfigValidationResult> {
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: args.root,
          writeDebounce: 1,
        })
        const env = args.env ?? process.env
        const pluginRegistry = createFirstPartyPluginRegistryFromEnv(env)
        const repository = createLibraryRepository(db, {
          env,
          pluginRegistry,
          launchIntegrations:
            firstPartyLaunchIntegrationsForRegistry(pluginRegistry),
        })
        return yield* repository.resolveLaunchForGame(args.gameId)
      }),
    ),
  )

  if (Exit.isSuccess(exit)) {
    return {
      status: "resolved",
      gameId: args.gameId,
      spec: exit.value.spec,
      ...(exit.value.app ? { app: exit.value.app } : {}),
      ...(exit.value.module ? { module: exit.value.module } : {}),
      ...(exit.value.settings ? { settings: exit.value.settings } : {}),
      ...(exit.value.artifacts ? { artifacts: exit.value.artifacts } : {}),
      ...(exit.value.diagnostics
        ? { diagnostics: exit.value.diagnostics }
        : {}),
    }
  }

  const error = Cause.squash(exit.cause)
  const errorTag =
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof (error as { _tag: unknown })._tag === "string"
      ? (error as { _tag: string })._tag
      : "LaunchResolutionFailed"
  return {
    status: "diagnostic",
    gameId: args.gameId,
    reason: errorTag,
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
