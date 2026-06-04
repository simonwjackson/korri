import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

const formatFlag = Flag.choice("format", [
  "json",
  "jsonl",
  "tsv",
] as const).pipe(Flag.withDefault("json" as const))
const logLevelFlag = Flag.optional(
  Flag.choice("log-level", ["debug", "info", "warn", "error"] as const),
)
const logJsonFlag = Flag.optional(Flag.boolean("log-json"))
const cacheFlag = Flag.boolean("cache").pipe(Flag.withDefault(true))
const interactiveFlag = Flag.boolean("interactive").pipe(Flag.withDefault(true))
const sourcesFlag = Flag.optional(Flag.string("sources"))
const timeoutSecondsFlag = Flag.integer("timeout").pipe(Flag.withDefault(30))

const notImplemented = (command: string) =>
  Effect.sync(() => {
    console.error(`korri bazzar ${command} is not wired yet`)
    process.exitCode = 1
  })

const searchCommand = Command.make(
  "search",
  {
    query: Argument.string("query"),
    format: formatFlag,
    platforms: Flag.optional(Flag.string("platforms")),
    sources: sourcesFlag,
    interactive: interactiveFlag,
    cache: cacheFlag,
    cursor: Flag.optional(Flag.string("cursor")),
    timeout: timeoutSecondsFlag,
    filter: Flag.optional(Flag.string("filter")),
    strict: Flag.boolean("strict").pipe(Flag.withDefault(false)),
    validate: Flag.boolean("validate").pipe(Flag.withDefault(false)),
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  () => notImplemented("search"),
).pipe(Command.withDescription("Search for source candidates"))

const detailsCommand = Command.make(
  "details",
  {
    url: Argument.string("url"),
    format: formatFlag,
    cache: cacheFlag,
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  () => notImplemented("details"),
).pipe(
  Command.withDescription("Get detailed information about a source candidate"),
)

const pluginsCommand = Command.make(
  "plugins",
  {
    format: formatFlag,
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  () => notImplemented("plugins"),
).pipe(Command.withDescription("List available plugins"))

const validateSourcesCommand = Command.make(
  "validate-sources",
  {
    sources: sourcesFlag,
    timeout: Flag.integer("timeout").pipe(Flag.withDefault(5000)),
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  () => notImplemented("validate-sources"),
).pipe(
  Command.withDescription(
    "Validate source adapter health and emit the stable JSON contract",
  ),
)

const resolveDownloadCommand = Command.make(
  "resolve-download",
  {
    source: Argument.string("source"),
    candidateUrl: Argument.string("candidateUrl"),
    // Bazzar compatibility: resolve-download requires --title.
    title: Flag.string("title"),
    site: Flag.optional(Flag.string("site")),
    fileName: Flag.optional(Flag.string("file-name")),
    size: Flag.optional(Flag.string("size")),
    artifactFormat: Flag.optional(Flag.string("artifact-format")),
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  () => notImplemented("resolve-download"),
).pipe(
  Command.withDescription(
    "Resolve a source-owned candidate URL and emit the stable JSON contract",
  ),
)

export const bazzarCommand = Command.make("bazzar").pipe(
  Command.withDescription("Game Bazaar - Multi-source Game Search"),
  Command.withSubcommands([
    searchCommand,
    detailsCommand,
    pluginsCommand,
    validateSourcesCommand,
    resolveDownloadCommand,
  ]),
)
