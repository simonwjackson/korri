import { LibraryError } from "@platform/library/library-services"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import {
  type AdoptArtifactOutput,
  createLibraryRepository,
} from "@platform/library/proseql/library-repository"
import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

const ARTIFACT_CLI_CONTRACT_VERSION = "korri.artifact-import.v1"
const ARTIFACT_EXIT_CODES = {
  success: 0,
  import_error: 1,
} as const

type ArtifactExitCategory = keyof typeof ARTIFACT_EXIT_CODES

type ArtifactKind = "content" | "patch"

const kindFlag = Flag.choice("kind", ["content", "patch"] as const)
const systemFlag = Flag.optional(Flag.string("system"))
const formatIdFlag = Flag.string("format-id")
const nameFlag = Flag.string("name")
const extensionFlag = Flag.optional(Flag.string("extension"))
const adoptGameFlag = Flag.boolean("adopt-game").pipe(Flag.withDefault(false))
const gameIdFlag = Flag.optional(Flag.string("game-id"))
const titleFlag = Flag.optional(Flag.string("title"))

function printStdout(text: string) {
  console.log(text)
}

function printStderr(text: string) {
  console.error(text)
}

function setExit(category: ArtifactExitCategory) {
  process.exitCode = ARTIFACT_EXIT_CODES[category]
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nowIso() {
  return new Date().toISOString()
}

const importFileCommand = Command.make(
  "import-file",
  importArgs("sourcePath"),
  args => runImportCommand("import-file", args),
).pipe(
  Command.withDescription("Import a local file into durable artifact storage"),
)

const importStagedCommand = Command.make(
  "import-staged",
  importArgs("stagedPath"),
  args => runImportCommand("import-staged", args),
).pipe(
  Command.withDescription(
    "Import an acquisition-staged artifact into durable artifact storage",
  ),
)

export const artifactCommand = Command.make("artifacts").pipe(
  Command.withDescription("Import and adopt Korri artifacts."),
  Command.withSubcommands([importFileCommand, importStagedCommand]),
)

function importArgs(argumentName: string) {
  return {
    sourcePath: Argument.string(argumentName),
    kind: kindFlag,
    system: systemFlag,
    formatId: formatIdFlag,
    name: nameFlag,
    extension: extensionFlag,
    adoptGame: adoptGameFlag,
    gameId: gameIdFlag,
    title: titleFlag,
  }
}

function runImportCommand(
  command: "import-file" | "import-staged",
  args: {
    readonly sourcePath: string
    readonly kind: ArtifactKind
    readonly system: Option.Option<string>
    readonly formatId: string
    readonly name: string
    readonly extension: Option.Option<string>
    readonly adoptGame: boolean
    readonly gameId: Option.Option<string>
    readonly title: Option.Option<string>
  },
) {
  return Effect.gen(function* () {
    const result = yield* importArtifact(args).pipe(
      Effect.match({
        onFailure: error => ({ _tag: "Left" as const, error }),
        onSuccess: value => ({ _tag: "Right" as const, value }),
      }),
    )

    if (result._tag === "Left") {
      setExit("import_error")
      printStderr(safeErrorMessage(result.error))
      return
    }

    setExit("success")
    printStdout(JSON.stringify(successEnvelope(command, result.value)))
  })
}

function importArtifact(args: Parameters<typeof runImportCommand>[1]) {
  return Effect.scoped(
    Effect.gen(function* () {
      const libraryRoot = yield* requiredEnv("KORRI_LIBRARY_ROOT")
      const system = Option.getOrUndefined(args.system)
      const extension = Option.getOrUndefined(args.extension)
      const env = {
        KORRI_LIBRARY_ROOT: libraryRoot,
        KORRI_ARTIFACTS_ROOT: process.env.KORRI_ARTIFACTS_ROOT,
      }
      const db = yield* openKorriLibraryDb({
        root: libraryRoot,
        writeDebounce: 1,
      })
      const repo = createLibraryRepository(db, { env })
      return yield* repo.adoptArtifact({
        source: { kind: "file", sourcePath: args.sourcePath },
        artifact: {
          kind: args.kind,
          system,
          format: { id: args.formatId },
          file: {
            name: args.name,
            ...(extension ? { extension } : {}),
          },
        },
        library: {
          createGame: args.adoptGame,
          gameId: Option.getOrUndefined(args.gameId),
          system,
          title: Option.getOrUndefined(args.title),
        },
      })
    }),
  )
}

function requiredEnv(name: string): Effect.Effect<string, LibraryError> {
  const value = process.env[name]?.trim()
  return value
    ? Effect.succeed(value)
    : Effect.fail(
        new LibraryError({
          reason: "config",
          message: `${name} is required`,
        }),
      )
}

function successEnvelope(
  command: "import-file" | "import-staged",
  output: AdoptArtifactOutput,
) {
  return {
    contractVersion: ARTIFACT_CLI_CONTRACT_VERSION,
    command,
    exitCategory: "success" as const,
    exitCode: ARTIFACT_EXIT_CODES.success,
    emittedAt: nowIso(),
    data: {
      lifecycle: {
        staged: command === "import-staged",
        durable: true,
        launched: false,
      },
      artifact: output.artifact,
      ...(output.game
        ? {
            game: {
              id: output.game.id,
              system: output.game.system,
              content: output.game.content,
            },
          }
        : {}),
    },
  }
}
