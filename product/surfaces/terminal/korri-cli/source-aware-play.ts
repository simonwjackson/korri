import { getGameDisplayName } from "@platform/fixtures/games/game"
import type {
  LauncherService,
  LibrarySourceService,
} from "@platform/library/library-services"
import { Cause, Effect, Exit } from "effect"
import type { GamePicker } from "./game-picker"
import {
  type DiscoverStreamHostsOptions,
  discoverStreamHosts,
  type StreamHostCandidate,
} from "./lan-stream-discovery"
import { resolveCliMoonlightLaunchPolicy } from "./moonlight-launch-policy"
import {
  launchMoonlight,
  type MoonlightLaunchOptions,
  type MoonlightLaunchResult,
} from "./moonlight-launcher"
import {
  createRemoteStreamControlClient,
  type RemotePrepareResult,
  type RemoteStreamControlClient,
} from "./remote-stream-control-client"
import {
  findEntryForChoice,
  loadSourceAwareGames,
  type SourceAwareEntry,
  type SourceDiagnostic,
} from "./source-aware-games"

export interface RunSourceAwarePlayCommandOptions {
  readonly host?: string
  readonly librarySource: LibrarySourceService
  readonly launcher: LauncherService
  readonly gamePicker?: GamePicker
  readonly stdinIsTty?: boolean
  readonly discoverHosts?: (
    options: DiscoverStreamHostsOptions,
  ) => Promise<readonly StreamHostCandidate[]>
  readonly clientForHost?: (
    host: StreamHostCandidate,
  ) => RemoteStreamControlClient
  readonly launchMoonlight?: (
    options: MoonlightLaunchOptions,
  ) => Promise<MoonlightLaunchResult>
  readonly output?: (line: string) => void
  readonly errorOutput?: (line: string) => void
}

export async function runSourceAwarePlayCommand(
  options: RunSourceAwarePlayCommandOptions,
): Promise<number> {
  const output = options.output ?? console.log
  const errorOutput = options.errorOutput ?? console.error
  const discover = options.discoverHosts ?? discoverStreamHosts
  const remoteHosts = await discover({ manualHost: options.host })
  const result = await loadSourceAwareGames({
    localSource: options.librarySource,
    remoteHosts,
    clientForHost: host =>
      options.clientForHost?.(host) ??
      createRemoteStreamControlClient(host.controlUrl),
  })

  for (const diagnostic of result.diagnostics) {
    errorOutput(diagnosticMessage(diagnostic))
  }

  if (result.entries.length === 0) {
    errorOutput("No playable local or remote games were found")
    return 5
  }
  if (options.stdinIsTty === false) {
    errorOutput("Interactive local/remote game selection requires a terminal")
    return 2
  }
  if (!options.gamePicker) {
    errorOutput("Interactive local/remote game selection is unavailable")
    return 2
  }

  const selected = await options.gamePicker(
    result.entries.map(entry => entry.choice),
  )
  if (!selected) {
    errorOutput("Local/remote game selection cancelled")
    return 130
  }

  const entry = findEntryForChoice(result.entries, selected)
  if (!entry) {
    errorOutput("Selected game is no longer available")
    return 6
  }

  return await runEntryAction({ ...options, entry, output, errorOutput })
}

async function runEntryAction(
  options: RunSourceAwarePlayCommandOptions & {
    readonly entry: SourceAwareEntry
    readonly output: (line: string) => void
    readonly errorOutput: (line: string) => void
  },
): Promise<number> {
  if (isLocalEntry(options.entry)) {
    return await runLocalEntry(options, options.entry)
  }
  return await runRemoteEntry(options, options.entry)
}

function isLocalEntry(
  entry: SourceAwareEntry,
): entry is Extract<
  SourceAwareEntry,
  { readonly source: { readonly kind: "local" } }
> {
  return entry.source.kind === "local"
}

async function runLocalEntry(
  options: RunSourceAwarePlayCommandOptions & {
    readonly output: (line: string) => void
    readonly errorOutput: (line: string) => void
  },
  entry: Extract<
    SourceAwareEntry,
    { readonly source: { readonly kind: "local" } }
  >,
): Promise<number> {
  const specExit = await Effect.runPromiseExit(
    options.librarySource.launchSpecFor(entry.game.id),
  )
  if (Exit.isFailure(specExit)) {
    options.errorOutput(errorMessage(Cause.squash(specExit.cause)))
    return 5
  }
  if (!specExit.value) {
    options.errorOutput(`Game ${entry.game.id} does not have a launch target`)
    return 5
  }

  const launchExit = await Effect.runPromiseExit(
    options.launcher.run(specExit.value),
  )
  if (Exit.isFailure(launchExit)) {
    options.errorOutput(errorMessage(Cause.squash(launchExit.cause)))
    return 6
  }
  if (launchExit.value.status === "failed") {
    options.errorOutput(
      `Local launch failed with exit code ${launchExit.value.exitCode}`,
    )
    if (launchExit.value.stderrTail)
      options.errorOutput(launchExit.value.stderrTail)
    return 6
  }

  options.output(`Launched ${getGameDisplayName(entry.game)} locally.`)
  return 0
}

async function runRemoteEntry(
  options: RunSourceAwarePlayCommandOptions & {
    readonly output: (line: string) => void
    readonly errorOutput: (line: string) => void
  },
  entry: Extract<
    SourceAwareEntry,
    { readonly source: { readonly kind: "remote" } }
  >,
): Promise<number> {
  const client =
    options.clientForHost?.(entry.source.host) ??
    createRemoteStreamControlClient(entry.source.host.controlUrl)
  const prepare = await client.prepareGame(entry.game.id)
  if (prepare.status === "failed") {
    options.errorOutput(prepare.message)
    return exitCodeForPrepareFailure(prepare)
  }

  options.output(
    `Prepared ${entry.game.displayName} from ${entry.source.name} for Korri Stream.`,
  )
  options.output("Attempting to open Moonlight locally...")
  const localPolicy = await resolveCliMoonlightLaunchPolicy(
    options.librarySource,
  )
  if (localPolicy.status === "failed") {
    options.errorOutput(localPolicy.message)
    return 6
  }
  const moonlight = await (options.launchMoonlight ?? launchMoonlight)({
    host: entry.source.host.id,
    ...localPolicy.options,
  })
  if (moonlight.status === "started") {
    options.output(`Moonlight launch attempted via ${moonlight.command}.`)
    return 0
  }

  options.output(moonlight.message)
  options.output(
    "Remote staging succeeded; connect to the Korri Stream app manually if needed.",
  )
  return 0
}

function diagnosticMessage(diagnostic: SourceDiagnostic): string {
  return `${diagnostic.sourceName}: ${diagnostic.message}`
}

function exitCodeForPrepareFailure(
  result: Extract<RemotePrepareResult, { status: "failed" }>,
): number {
  switch (result.category) {
    case "host-unavailable":
      return 4
    case "host-control-disabled":
      return 5
    case "no-such-game":
      return 3
    case "prepare-failed":
      return 6
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return String(error)
}
