import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { AcquisitionError } from "@platform/acquisition/errors"
import type { AcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { PluginMetadata } from "@platform/protocol/acquisition/plugin"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

const BAZZAR_CLI_CONTRACT_VERSION = "bazzar.provider-adapter.v1"
const BAZZAR_EXIT_CODES = {
  success: 0,
  partial_degradation: 10,
  provider_failure: 11,
  configuration_error: 20,
  caller_error: 21,
  contract_error: 70,
} as const

type BazzarExitCategory = keyof typeof BAZZAR_EXIT_CODES

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
const providersFlag = Flag.optional(Flag.string("providers"))
const timeoutSecondsFlag = Flag.integer("timeout").pipe(Flag.withDefault(30))

type Format = "json" | "jsonl" | "tsv"

function parseProviderIds(value: Option.Option<string>): string[] | undefined {
  const raw = Option.getOrUndefined(value)
  if (!raw) return undefined
  const names = raw
    .split(",")
    .map(source => source.trim())
    .filter(source => source.length > 0)
  return names.length > 0 ? names : undefined
}

function formatDetails(row: Record<string, unknown>, format: Format) {
  if (format === "json") return JSON.stringify(row, null, 2)
  return formatRows([row], format)
}

function formatRows(rows: readonly Record<string, unknown>[], format: Format) {
  switch (format) {
    case "jsonl":
      return rows.map(row => JSON.stringify(row)).join("\n")
    case "tsv": {
      if (rows.length === 0) return ""
      const headers = Object.keys(rows[0] ?? {})
      const values = rows.map(row =>
        headers.map(header => String(row[header] ?? "")).join("\t"),
      )
      return [headers.join("\t"), ...values].join("\n")
    }
    case "json":
      return JSON.stringify(rows, null, 2)
  }
}

function printStdout(text: string) {
  console.log(text)
}

function printStderr(text: string) {
  console.error(text)
}

function setExit(category: BazzarExitCategory) {
  process.exitCode = BAZZAR_EXIT_CODES[category]
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function acquisitionErrorExitCategory(
  error: AcquisitionError,
): BazzarExitCategory {
  if (error.reason === "caller") return "caller_error"
  if (error.reason === "configuration") return "configuration_error"
  return "provider_failure"
}

function toResult<A, E>(effect: Effect.Effect<A, E>) {
  return effect.pipe(
    Effect.match({
      onFailure: error => ({ _tag: "Left" as const, left: error }),
      onSuccess: value => ({ _tag: "Right" as const, right: value }),
    }),
  )
}

const searchCommand = Command.make(
  "search",
  {
    query: Argument.string("query"),
    format: formatFlag,
    platforms: Flag.optional(Flag.string("platforms")),
    providers: providersFlag,
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
  ({ query, format, providers, platforms }) =>
    Effect.gen(function* () {
      const acquisition = yield* Acquisition
      const response = yield* acquisition
        .search({
          query,
          providerIds: parseProviderIds(providers),
          platforms: parseProviderIds(platforms),
        })
        .pipe(toResult)

      if (response._tag === "Left") {
        printStderr(safeErrorMessage(response.left))
        setExit(acquisitionErrorExitCategory(response.left))
        return
      }

      if (response.right.claims.length === 0) {
        printStdout("No results found")
        return
      }

      printStdout(formatRows(response.right.claims, format))
    }),
).pipe(Command.withDescription("Search for provider claims"))

const detailsCommand = Command.make(
  "details",
  {
    url: Argument.string("url"),
    format: formatFlag,
    cache: cacheFlag,
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  ({ url, format }) =>
    Effect.gen(function* () {
      const acquisition = yield* Acquisition
      const parsed = parseDetailsLocator(url)
      const details = yield* (
        parsed ? acquisition.details(parsed) : acquisition.detailsByUrl(url)
      ).pipe(toResult)
      if (details._tag === "Left") {
        printStderr(safeErrorMessage(details.left))
        setExit(acquisitionErrorExitCategory(details.left))
        return
      }

      printStdout(formatDetails(details.right, format))
    }),
).pipe(
  Command.withDescription("Get detailed information about a provider claim"),
)

const pluginsCommand = Command.make(
  "plugins",
  {
    format: formatFlag,
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  ({ format }) =>
    Effect.gen(function* () {
      const acquisition = yield* Acquisition
      const plugins = yield* acquisition.providers().pipe(toResult)
      if (plugins._tag === "Left") {
        printStderr(safeErrorMessage(plugins.left))
        setExit(acquisitionErrorExitCategory(plugins.left))
        return
      }
      printStdout(formatRows(plugins.right.providers.map(pluginOutput), format))
    }),
).pipe(Command.withDescription("List available plugins"))

const validateProvidersCommand = Command.make(
  "validate-providers",
  {
    providers: providersFlag,
    timeout: Flag.integer("timeout").pipe(Flag.withDefault(5000)),
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  ({ providers }) =>
    Effect.gen(function* () {
      const acquisition = yield* Acquisition
      const checkedAt = nowIso()
      const response = yield* acquisition
        .validateProviders({ providerIds: parseProviderIds(providers) })
        .pipe(toResult)
      const outcomes =
        response._tag === "Right"
          ? response.right.providers.map(providerHealthOutcome)
          : [providerHealthErrorOutcome(response.left, checkedAt)]
      const envelope = validationEnvelope(outcomes, checkedAt)
      setExit(envelope.exitCategory)
      printStdout(JSON.stringify(envelope))
    }),
).pipe(
  Command.withDescription(
    "Validate provider adapter health and emit the stable JSON contract",
  ),
)

const acquireCommand = Command.make(
  "acquire",
  {
    provider: Argument.string("provider"),
    id: Argument.string("id"),
    logLevel: logLevelFlag,
    logJson: logJsonFlag,
  },
  ({ provider, id }) =>
    Effect.gen(function* () {
      const acquisition = yield* Acquisition
      const response = yield* acquisition
        .acquireArtifact({ providerId: provider, id })
        .pipe(toResult)
      if (response._tag === "Left") {
        printStderr(safeErrorMessage(response.left))
        setExit(acquisitionErrorExitCategory(response.left))
        return
      }

      setExit("success")
      printStdout(JSON.stringify(acquireEnvelope(response.right)))
    }),
).pipe(
  Command.withDescription(
    "Acquire a provider-native artifact into ephemeral staging",
  ),
)

const resolveDownloadCommand = Command.make(
  "resolve-download",
  {
    provider: Argument.string("provider"),
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
  ({ provider, candidateUrl, title, site, fileName, size, artifactFormat }) =>
    Effect.gen(function* () {
      const acquisition = yield* Acquisition
      const checkedAt = nowIso()
      const response = yield* acquisition
        .resolveDownload({ providerId: provider, candidateUrl })
        .pipe(toResult)
      const outcome =
        response._tag === "Right"
          ? resolutionOutcome({
              resolution: response.right,
              checkedAt,
              title,
              site: Option.getOrUndefined(site),
              fileName: Option.getOrUndefined(fileName),
              size: Option.getOrUndefined(size),
              artifactFormat: Option.getOrUndefined(artifactFormat),
            })
          : resolutionErrorOutcome({
              error: response.left,
              checkedAt,
              source: provider,
              title,
              site: Option.getOrUndefined(site),
            })
      const envelope = resolutionEnvelope(outcome)
      setExit(envelope.exitCategory)
      printStdout(JSON.stringify(envelope))
    }),
).pipe(
  Command.withDescription(
    "Resolve a provider-owned claim URL and emit the stable JSON contract",
  ),
)

export const bazzarCommand = Command.make("bazzar").pipe(
  Command.withDescription("Game Bazaar - Multi-provider Game Search"),
  Command.withSubcommands([
    searchCommand,
    detailsCommand,
    pluginsCommand,
    validateProvidersCommand,
    acquireCommand,
    resolveDownloadCommand,
  ]),
)

function acquireEnvelope(artifact: AcquiredArtifact) {
  return {
    contractVersion: BAZZAR_CLI_CONTRACT_VERSION,
    command: "acquire" as const,
    exitCategory: "success" as const,
    exitCode: BAZZAR_EXIT_CODES.success,
    emittedAt: nowIso(),
    data: {
      lifecycle: {
        staged: true,
        durable: false,
        launched: false,
      },
      artifact: {
        id: artifact.id,
        kind: artifact.kind,
        system: artifact.system,
        format: artifact.format,
        file: artifact.file,
        stagedPath: artifact.stagedPath,
        // v1 exposes both the canonical prefixed `id` and raw digest bag.
        // Consumers should use `id` for identity; `digests` is compatibility
        // metadata for existing Bazzar pipelines.
        digests: artifact.digests,
        expectedDigests: artifact.expectedDigests,
        facets: artifact.facets,
        provenance: artifact.provenance,
        externalIds: artifact.externalIds,
        sourceData: artifact.sourceData,
      },
    },
  }
}

function pluginOutput(plugin: PluginMetadata): Record<string, unknown> {
  return {
    providerId: plugin.providerId,
    pluginName: plugin.providerId,
    displayName: plugin.displayName,
    module: plugin.module,
    builtIn: plugin.builtIn,
    enabledByDefault: plugin.enabledByDefault,
    legalRisk: plugin.legalRisk,
    credentialRequired: plugin.credentialRequired,
  }
}

function parseDetailsLocator(
  url: string,
): { providerId: string; id: string } | null {
  if (url.includes("://")) return null
  const match = /^(@[^:]+:[^:]+):(.+)$/.exec(url)
  if (match) return { providerId: match[1] ?? "", id: match[2] ?? "" }
  return null
}

function sourceIdentity(providerId: string, site?: string) {
  return { plugin: providerId, site: site ?? providerId }
}

function nowIso() {
  return new Date().toISOString()
}

type ProviderHealthOutcome = Record<string, unknown> & {
  status: string
  source: { plugin: string; site: string }
}

function providerHealthOutcome(source: ProviderHealth): ProviderHealthOutcome {
  if (source._tag === "HealthyProvider") {
    return {
      kind: "source_health",
      source: sourceIdentity(source.providerId),
      status: "healthy",
      checkedAt: source.checkedAt,
      probe: {
        search: "skipped",
        details: "skipped",
        safeProbe: "not_available",
      },
    }
  }

  const status =
    source.reason === "configuration" || source.reason === "credentials"
      ? "configuration_error"
      : source.reason === "defective-provider"
        ? "defective"
        : "unavailable"
  return {
    kind: "source_health",
    source: sourceIdentity(source.providerId),
    status,
    checkedAt: source.checkedAt,
    probe: {
      search: "skipped",
      details: "skipped",
      safeProbe: "not_available",
    },
    reason: source.message,
    message: source.message,
  }
}

function providerHealthErrorOutcome(
  error: AcquisitionError,
  checkedAt: string,
): ProviderHealthOutcome {
  const providerId = error.providerId ?? "unknown"
  const status =
    error.reason === "configuration" ? "configuration_error" : "caller_error"
  return {
    kind: "source_health",
    source: sourceIdentity(providerId),
    status,
    checkedAt,
    probe: {
      search: "skipped",
      details: "skipped",
      safeProbe: "not_available",
    },
    reason: safeErrorMessage(error),
  }
}

function validationEnvelope(
  outcomes: ProviderHealthOutcome[],
  checkedAt: string,
) {
  const exitCategory = validationExitCategory(outcomes)
  return {
    contractVersion: BAZZAR_CLI_CONTRACT_VERSION,
    command: "validate-providers" as const,
    exitCategory,
    exitCode: BAZZAR_EXIT_CODES[exitCategory],
    emittedAt: nowIso(),
    data: { checkedAt, outcomes },
  }
}

function validationExitCategory(
  outcomes: ProviderHealthOutcome[],
): BazzarExitCategory {
  if (outcomes.length === 0) return "caller_error"
  if (outcomes.some(outcome => outcome.status === "caller_error"))
    return "caller_error"
  if (outcomes.some(outcome => outcome.status === "configuration_error")) {
    return "configuration_error"
  }
  if (outcomes.every(outcome => outcome.status === "healthy")) return "success"
  return "partial_degradation"
}

type ResolutionOutcome = Record<string, unknown> & { status: string }

interface ResolutionContext {
  readonly checkedAt: string
  readonly title: string
  readonly site?: string
  readonly fileName?: string
  readonly size?: string
  readonly artifactFormat?: string
}

function resolutionOutcome(
  input: ResolutionContext & { readonly resolution: DownloadResolution },
): ResolutionOutcome {
  const resolution = input.resolution
  switch (resolution._tag) {
    case "FinalDownload":
      return finalResolutionOutcome({ ...input, resolution })
    case "NonFinalDownload":
      return nonFinalResolutionOutcome({ ...input, resolution })
    case "FailedDownload":
      return failedResolutionOutcome({ ...input, resolution })
  }
}

function finalResolutionOutcome({
  resolution,
  checkedAt,
  title,
  site,
  fileName,
  size,
  artifactFormat,
}: ResolutionContext & {
  readonly resolution: Extract<DownloadResolution, { _tag: "FinalDownload" }>
}): ResolutionOutcome {
  return {
    kind: "download_resolution",
    source: sourceIdentity(resolution.providerId, site),
    candidateTitle: title,
    checkedAt,
    status: "final_artifact",
    artifact: {
      url: resolution.url,
      final: true,
      ...((resolution.filename ?? fileName)
        ? { name: resolution.filename ?? fileName }
        : {}),
      ...(resolution.contentType ? { kind: resolution.contentType } : {}),
      ...(size ? { size } : {}),
      ...(artifactFormat ? { format: artifactFormat } : {}),
    },
  }
}

function nonFinalResolutionOutcome({
  resolution,
  checkedAt,
  title,
  site,
}: ResolutionContext & {
  readonly resolution: Extract<DownloadResolution, { _tag: "NonFinalDownload" }>
}): ResolutionOutcome {
  return {
    kind: "download_resolution",
    source: sourceIdentity(resolution.providerId, site),
    candidateTitle: title,
    checkedAt,
    status: nonFinalStatus(resolution.reason),
    ...(resolution.url ? { handoffUrl: resolution.url } : {}),
    reason: resolution.reason,
  }
}

function nonFinalStatus(reason: string) {
  if (reason === "unsupported") return "unsupported"
  if (reason === "requires-user-action") return "access_required"
  return "interstitial"
}

function failedResolutionOutcome({
  resolution,
  checkedAt,
  title,
  site,
}: ResolutionContext & {
  readonly resolution: Extract<DownloadResolution, { _tag: "FailedDownload" }>
}): ResolutionOutcome {
  return {
    kind: "download_resolution",
    source: sourceIdentity(resolution.providerId, site),
    candidateTitle: title,
    checkedAt,
    status: failedResolutionStatus(resolution.reason),
    reason: resolution.message,
    message: resolution.message,
  }
}

function failedResolutionStatus(reason: string) {
  if (reason === "configuration") return "configuration_error"
  if (reason === "not-found") return "blocked_unavailable"
  return "source_defect"
}

function resolutionErrorOutcome({
  error,
  checkedAt,
  source,
  title,
  site,
}: {
  error: AcquisitionError
  checkedAt: string
  source: string
  title: string
  site?: string
}): ResolutionOutcome {
  const status =
    error.reason === "configuration" ? "configuration_error" : "caller_error"
  return {
    kind: "download_resolution",
    source: sourceIdentity(error.providerId ?? source, site),
    candidateTitle: title,
    checkedAt,
    status,
    reason:
      error.reason === "caller"
        ? `Unknown source: ${source}`
        : safeErrorMessage(error),
  }
}

function resolutionEnvelope(outcome: ResolutionOutcome) {
  const exitCategory = resolutionExitCategory(outcome)
  return {
    contractVersion: BAZZAR_CLI_CONTRACT_VERSION,
    command: "resolve-download" as const,
    exitCategory,
    exitCode: BAZZAR_EXIT_CODES[exitCategory],
    emittedAt: nowIso(),
    data: { outcome },
  }
}

function resolutionExitCategory(
  outcome: ResolutionOutcome,
): BazzarExitCategory {
  switch (outcome.status) {
    case "final_artifact":
    case "interstitial":
      return "success"
    case "configuration_error":
      return "configuration_error"
    case "caller_error":
      return "caller_error"
    default:
      return "provider_failure"
  }
}
