import type {
  ControlLaunchResult,
  ControlSessionActive,
  ControlSessionStatusResult,
} from "@platform/control/control-results"
import { releaseChoiceForLaunch } from "@platform/library/launch-state"
import { parseStreamBoundaryArgs } from "@platform/stream/stream-adaptive-boundaries"
import {
  selectStreamPreflightStartup,
  type StreamPreflightMode,
} from "@platform/stream/stream-preflight"
import type { LibrarySourceService } from "@platform/library/library-services"
import {
  type DiscoverStreamHostsOptions,
  discoverStreamHosts,
  type StreamHostCandidate,
} from "@platform/stream/lan-stream-discovery"
import { Effect, Exit } from "effect"
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
  readonly streamBoundaryArgs?: readonly string[]
  readonly streamPreflight?: StreamPreflightMode | string
  readonly stdinIsTty?: boolean
  readonly confirmYes?: boolean
  readonly librarySource: LibrarySourceService
  readonly launchLocal: (
    request: LocalLaunchRequest,
  ) => Promise<ControlLaunchResult>
  readonly sessionStatus?: () => Promise<ControlSessionStatusResult>
  readonly confirmPrompt?: (message: string) => Promise<boolean>
  readonly gamePicker?: GamePicker
  readonly releasePicker?: (
    releaseIds: readonly string[],
  ) => Promise<string | undefined>
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

  const confirmation = await confirmTermination(options)
  if (confirmation === "NeedsYes") {
    return emit(
      renderOutcome(
        fail("usage", "A game is currently running; pass --yes to replace it"),
      ),
    )
  }
  if (confirmation === "Declined") {
    return emit(renderOutcome(fail("cancelled", "Launch cancelled")))
  }

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
  const release = await resolveLocalRelease(options, entry.game.id)
  if (release._tag === "Failed") return renderOutcome(release.outcome)

  const result = await options.launchLocal({
    id: entry.game.id,
    ...(release.releaseId ? { releaseId: release.releaseId } : {}),
    ...(options.appId ? { appId: options.appId } : {}),
    ...(options.profileId ? { profileId: options.profileId } : {}),
  })
  return {
    text: renderLaunchGame(result).split("\n"),
    code: launchGameExitCode(result),
  }
}

/**
 * Resolve which release a local launch should use. `--release-id` wins; when a
 * game legitimately requires a release choice, prompt for it (or report
 * ambiguous with no terminal). App and profile have no required-signal today,
 * so they only pass through as flags.
 */
async function resolveLocalRelease(
  options: RunLaunchCommandOptions,
  gameId: string,
): Promise<
  | { readonly _tag: "Ready"; readonly releaseId?: string }
  | { readonly _tag: "Failed"; readonly outcome: CliOutcome }
> {
  if (options.releaseId) return { _tag: "Ready", releaseId: options.releaseId }

  const listPlayable = options.librarySource.listPlayableEntries
  if (!listPlayable) return { _tag: "Ready" }

  const exit = await Effect.runPromiseExit(listPlayable())
  if (Exit.isFailure(exit)) return { _tag: "Ready" }
  const entry = exit.value.find(candidate => candidate.id === gameId)
  if (!entry) return { _tag: "Ready" }

  const choice = releaseChoiceForLaunch(entry, undefined)
  if (choice._tag !== "ReleaseRequired") return { _tag: "Ready" }

  if (options.stdinIsTty === false) {
    return {
      _tag: "Failed",
      outcome: fail(
        "ambiguous",
        `Game ${gameId} needs a release; pass --release-id`,
      ),
    }
  }
  if (!options.releasePicker) {
    return {
      _tag: "Failed",
      outcome: fail("usage", "Interactive release selection is unavailable"),
    }
  }
  const chosen = await options.releasePicker(choice.releaseIds)
  if (!chosen) {
    return { _tag: "Failed", outcome: fail("cancelled", "Launch cancelled") }
  }
  return { _tag: "Ready", releaseId: chosen }
}

async function launchRemoteEntry(
  options: RunLaunchCommandOptions,
  entry: RemoteEntry,
  output: (line: string) => void,
): Promise<CliOutcome> {
  const client = remoteClientFor(entry.source.host, options.clientForHost)
  const parsedBoundaries = options.streamBoundaryArgs
    ? parseStreamBoundaryArgs(options.streamBoundaryArgs)
    : undefined
  const preflightMode = streamPreflightMode(options.streamPreflight)
  if (preflightMode._tag === "Invalid") {
    return fail("usage", preflightMode.message)
  }
  const preflight = selectStreamPreflightStartup({
    mode: preflightMode.mode,
    boundaries: parsedBoundaries,
    facts: {
      sourceReachable: entry.source.status.status === "available",
      streamControlReachable:
        entry.source.status.streamControl === "enabled",
    },
  })
  if (preflight.status === "rejected") {
    return fail("launch-invalid", `Stream preflight rejected launch: ${preflight.message}`)
  }
  if (preflight.status === "selected" || preflight.status === "warning") {
    output(`Stream preflight: ${preflight.message}`)
  }

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
    ...(preflight.boundaries ? { adaptiveBoundaries: preflight.boundaries } : {}),
  })
  if (moonlight.status === "started") {
    return ok([`Moonlight launch attempted via ${moonlight.command}.`])
  }
  return ok([
    moonlight.message,
    "Remote staging succeeded; connect to the Korri Stream app manually if needed.",
  ])
}

function streamPreflightMode(
  raw: StreamPreflightMode | string | undefined,
):
  | { readonly _tag: "Valid"; readonly mode: StreamPreflightMode }
  | { readonly _tag: "Invalid"; readonly message: string } {
  if (raw === undefined || raw === "auto") return { _tag: "Valid", mode: "auto" }
  if (raw === "skip" || raw === "required") return { _tag: "Valid", mode: raw }
  return {
    _tag: "Invalid",
    message:
      "Invalid stream preflight mode; use auto, required, or skip",
  }
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

/**
 * Prompt before a launch that the session layer says will terminate a running
 * game. Confirmation follows the consequence, not the verb: when the session
 * layer reports nothing to terminate (or a future non-terminating outcome), the
 * prompt never appears.
 */
async function confirmTermination(
  options: RunLaunchCommandOptions,
): Promise<"Proceed" | "Declined" | "NeedsYes"> {
  if (options.confirmYes) return "Proceed"
  if (!options.sessionStatus) return "Proceed"

  const active = terminatingActive(await options.sessionStatus())
  if (!active) return "Proceed"
  if (options.stdinIsTty === false || !options.confirmPrompt) return "NeedsYes"

  const confirmed = await options.confirmPrompt(
    `This closes ${activeLabel(active)}. Continue?`,
  )
  return confirmed ? "Proceed" : "Declined"
}

function terminatingActive(
  status: ControlSessionStatusResult,
): ControlSessionActive | undefined {
  return status._tag === "SessionStatus" ? status.active : undefined
}

function activeLabel(active: ControlSessionActive): string {
  return active.title ?? active.gameId ?? active.launchId
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
