import type { ControlLaunchResult } from "@platform/control/control-results"
import type { LibrarySourceService } from "@platform/library/library-services"
import {
  type DiscoverStreamHostsOptions,
  discoverStreamHosts,
  type StreamHostCandidate,
} from "@platform/stream/lan-stream-discovery"
import { remoteClientFor } from "./cli-helpers"
import {
  type CliOutcome,
  fail,
  ok,
  type RenderedOutcome,
  renderOutcome,
} from "./cli-outcome"
import { launchGameExitCode, renderLaunchGame } from "./control-renderers"
import type { GamePicker } from "./game-picker"
import { pickGameChoice } from "./interactive-pick"
import { resolveCliMoonlightLaunchPolicy } from "./moonlight-launch-policy"
import {
  launchMoonlight,
  type MoonlightLaunchOptions,
  type MoonlightLaunchResult,
} from "./moonlight-launcher"
import type {
  RemotePrepareResult,
  RemoteStreamControlClient,
} from "./remote-stream-control-client"
import {
  findEntryForChoice,
  loadSourceAwareGames,
  type SourceAwareEntry,
  type SourceDiagnostic,
} from "./source-aware-games"

/** A local launch as seen by the control/sessiond plane. */
export interface LocalLaunchRequest {
  readonly id: string
  readonly releaseId?: string
  readonly appId?: string
  readonly profileId?: string
}

export interface RunLaunchCommandOptions {
  readonly gameId?: string
  readonly host?: string
  readonly releaseId?: string
  readonly appId?: string
  readonly profileId?: string
  readonly stdinIsTty?: boolean
  readonly librarySource: LibrarySourceService
  readonly launchLocal: (
    request: LocalLaunchRequest,
  ) => Promise<ControlLaunchResult>
  readonly gamePicker?: GamePicker
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

type RemoteEntry = Extract<
  SourceAwareEntry,
  { readonly source: { readonly kind: "remote" } }
>

export async function runLaunchCommand(
  options: RunLaunchCommandOptions,
): Promise<number> {
  const output = options.output ?? console.log
  const errorOutput = options.errorOutput ?? console.error
  const emit = (rendered: RenderedOutcome): number => {
    const sink = rendered.code === 0 ? output : errorOutput
    for (const line of rendered.text) sink(line)
    return rendered.code
  }

  const discover = options.discoverHosts ?? discoverStreamHosts
  const remoteHosts = await discover(
    options.host ? { manualHost: options.host } : {},
  )
  const merged = await loadSourceAwareGames({
    localSource: options.librarySource,
    remoteHosts,
    clientForHost: host => remoteClientFor(host, options.clientForHost),
  })
  for (const diagnostic of merged.diagnostics) {
    errorOutput(diagnosticMessage(diagnostic))
  }

  // --host targets a specific remote machine to stream from; drop local copies.
  const entries = options.host
    ? merged.entries.filter(entry => entry.source.kind === "remote")
    : merged.entries

  const target = await resolveTarget({ ...options, entries })
  if (target._tag === "Failed") return emit(renderOutcome(target.outcome))

  if (isLocalEntry(target.entry)) {
    return emit(await launchLocalEntry(options, target.entry))
  }
  return emit(
    renderOutcome(await launchRemoteEntry(options, target.entry, output)),
  )
}

type ResolveTargetResult =
  | { readonly _tag: "Resolved"; readonly entry: SourceAwareEntry }
  | { readonly _tag: "Failed"; readonly outcome: CliOutcome }

async function resolveTarget(
  options: RunLaunchCommandOptions & {
    readonly entries: readonly SourceAwareEntry[]
  },
): Promise<ResolveTargetResult> {
  const gameId = options.gameId?.trim()

  if (gameId) {
    const matches = options.entries.filter(entry => entry.game.id === gameId)
    if (matches.length === 0) {
      return failed(fail("not-found", `No game exists with id ${gameId}`))
    }
    if (matches.length === 1) return { _tag: "Resolved", entry: matches[0] }
    return await promptForEntry(options, matches, {
      onNoTty: fail(
        "ambiguous",
        `Game ${gameId} is available from more than one machine; pass --host to choose`,
      ),
      cancelledMessage: "Launch cancelled",
    })
  }

  if (options.entries.length === 0) {
    return failed(
      fail("not-configured", "No playable local or remote games were found"),
    )
  }

  return await promptForEntry(options, options.entries, {
    onNoTty: fail(
      "usage",
      "Pass a game id when running without an interactive terminal",
    ),
    cancelledMessage: "Launch cancelled",
  })
}

async function promptForEntry(
  options: RunLaunchCommandOptions,
  candidates: readonly SourceAwareEntry[],
  messages: {
    readonly onNoTty: CliOutcome
    readonly cancelledMessage: string
  },
): Promise<ResolveTargetResult> {
  const picked = await pickGameChoice({
    choices: candidates.map(entry => entry.choice),
    stdinIsTty: options.stdinIsTty,
    gamePicker: options.gamePicker,
  })
  switch (picked._tag) {
    case "NoTty":
      return failed(messages.onNoTty)
    case "NoPicker":
      return failed(fail("usage", "Interactive game selection is unavailable"))
    case "Cancelled":
      return failed(fail("cancelled", messages.cancelledMessage))
    case "Picked": {
      const entry = findEntryForChoice(candidates, picked.choice)
      if (!entry) {
        return failed(fail("not-found", "Selected game is no longer available"))
      }
      return { _tag: "Resolved", entry }
    }
  }
}

async function launchLocalEntry(
  options: RunLaunchCommandOptions,
  entry: SourceAwareEntry,
): Promise<RenderedOutcome> {
  const result = await options.launchLocal({
    id: entry.game.id,
    ...(options.releaseId ? { releaseId: options.releaseId } : {}),
    ...(options.appId ? { appId: options.appId } : {}),
    ...(options.profileId ? { profileId: options.profileId } : {}),
  })
  return {
    text: renderLaunchGame(result).split("\n"),
    code: launchGameExitCode(result),
  }
}

async function launchRemoteEntry(
  options: RunLaunchCommandOptions,
  entry: RemoteEntry,
  output: (line: string) => void,
): Promise<CliOutcome> {
  const client = remoteClientFor(entry.source.host, options.clientForHost)
  const prepare = await client.prepareGame(entry.game.id)
  if (prepare.status === "failed") {
    return prepareFailureOutcome(prepare)
  }

  output(
    `Prepared ${entry.game.displayName} from ${entry.source.name} for Korri Stream.`,
  )
  output("Attempting to open Moonlight locally...")
  const policy = await resolveCliMoonlightLaunchPolicy(options.librarySource)
  if (policy.status === "failed") {
    return fail("launch-invalid", policy.message)
  }
  const moonlight = await (options.launchMoonlight ?? launchMoonlight)({
    host: entry.source.host.id,
    ...policy.options,
  })
  if (moonlight.status === "started") {
    return ok([`Moonlight launch attempted via ${moonlight.command}.`])
  }
  return ok([
    moonlight.message,
    "Remote staging succeeded; connect to the Korri Stream app manually if needed.",
  ])
}

function prepareFailureOutcome(
  result: Extract<RemotePrepareResult, { status: "failed" }>,
): CliOutcome {
  switch (result.category) {
    case "host-unavailable":
      return fail("host-unreachable", result.message)
    case "host-control-disabled":
      return fail("host-service-off", result.message)
    case "no-such-game":
      return fail("not-found", result.message)
    case "prepare-failed":
      return fail("launch-invalid", result.message)
  }
}

function isLocalEntry(
  entry: SourceAwareEntry,
): entry is Extract<
  SourceAwareEntry,
  { readonly source: { readonly kind: "local" } }
> {
  return entry.source.kind === "local"
}

function failed(outcome: CliOutcome): ResolveTargetResult {
  return { _tag: "Failed", outcome }
}

function diagnosticMessage(diagnostic: SourceDiagnostic): string {
  return `${diagnostic.sourceName}: ${diagnostic.message}`
}
