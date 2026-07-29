import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import {
  type LaunchResult,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import {
  Launcher,
  type LauncherService,
  type LibraryError,
  LibrarySource,
  type LibrarySourceService,
  type ResolvedLaunch,
  type ResolveLaunchInputs,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import {
  freezeSessiondManagedLaunch,
  probeSessiondManagedLaunchStatus,
  type SessiondManagedLaunchClientOptions,
  type SessiondManagedLaunchFreezeResult,
  type SessiondManagedLaunchStatusResult,
  type SessiondManagedLaunchThawResult,
  terminateSessiondManagedLaunch,
  thawSessiondManagedLaunch,
} from "@platform/library/sessiond-managed-launch-client"
import { gameIdentityFromLaunchMetadata } from "@platform/library/sessiond-lifecycle-projections"
import { isLaunchReadyMode } from "@platform/library/sessiond-managed-launch-protocol"
import {
  composeLaunchCompanions,
  type LaunchCompanionDiagnostic,
  launchCompanionDiagnosticSummary,
} from "@platform/plugin/launch-companion"
import {
  type LaunchPrepareDiagnostic,
  type LaunchPrepareMode,
  launchPrepareDiagnosticSummary,
  prepareLaunch,
} from "@platform/plugin/launch-prepare"
import {
  createPluginRegistry,
  type PluginRegistry,
} from "@platform/plugin/registry"
import { Cause, Effect, Layer } from "effect"
import type {
  ControlDryRunLaunchRequest,
  ControlFreezeSessionRequest,
  ControlLaunchRequest,
  ControlStopSessionRequest,
  ControlThawSessionRequest,
} from "./control-requests"
import type {
  ControlDryRunLaunchResult,
  ControlFindGameResult,
  ControlFreezeSessionResult,
  ControlLaunchResult,
  ControlListGamesResult,
  ControlSessionReadiness,
  ControlSessionStatusResult,
  ControlStopSessionResult,
  ControlThawSessionResult,
} from "./control-results"
import {
  findPlayableEntry,
  KorriControl,
  type KorriControlService,
} from "./korri-control"

export interface KorriControlLiveOptions {
  readonly sessiond?: SessiondManagedLaunchClientOptions
  readonly stopSessionSettlePolls?: number
  readonly stopSessionSettlePollDelayMs?: number
  readonly pluginRegistry?: PluginRegistry
}

export const KorriControlLayerLive = KorriControlLayerLiveWithPlugins(
  createPluginRegistry([]),
)

export function KorriControlLayerLiveWithPlugins(
  pluginRegistry: PluginRegistry,
) {
  return Layer.effect(KorriControl)(
    Effect.gen(function* () {
      const librarySource = yield* LibrarySource
      const launcher = yield* Launcher
      return makeKorriControlLive({ librarySource, launcher, pluginRegistry })
    }),
  )
}

export function makeKorriControlLive(options: {
  readonly librarySource: LibrarySourceService
  readonly launcher: LauncherService
  readonly sessiond?: SessiondManagedLaunchClientOptions
  readonly stopSessionSettlePolls?: number
  readonly stopSessionSettlePollDelayMs?: number
  readonly pluginRegistry?: PluginRegistry
}): KorriControlService {
  const { librarySource, launcher, sessiond } = options
  const pluginRegistry = options.pluginRegistry ?? createPluginRegistry([])
  const stopSessionSettlePolls = options.stopSessionSettlePolls ?? 10
  const stopSessionSettlePollDelayMs =
    options.stopSessionSettlePollDelayMs ?? 100

  const listGames = (): Effect.Effect<ControlListGamesResult, never> =>
    listPlayableEntries(librarySource).pipe(
      Effect.match({
        onFailure: error => {
          const message = error.message || error.diagnostic
          return {
            _tag: "ListGamesUnavailable" as const,
            ...(message ? { message } : {}),
          }
        },
        onSuccess: games => ({ _tag: "GamesListed" as const, games }),
      }),
    )

  return {
    listGames,
    findGame: request =>
      listGames().pipe(
        Effect.map(result =>
          result._tag === "GamesListed"
            ? findPlayableEntry(result.games, request)
            : {
                _tag: "HostUnavailable" as const,
                ...(result.message ? { message: result.message } : {}),
              },
        ),
      ),
    dryRunLaunch: request =>
      Effect.gen(function* () {
        const result = yield* resolveLaunch(librarySource, request)
        if (result._tag === "failed") return result.result
        const prepared = yield* prepareResolvedLaunch(
          result.resolved,
          pluginRegistry,
          "check",
        )
        if (prepared._tag === "failed") {
          return launchConfigFailedFromDiagnostics(
            request,
            prepared.diagnostics,
            launchPrepareDiagnosticSummary(prepared.diagnostics),
          )
        }
        const composed = yield* composeResolvedLaunch(
          { ...result.resolved, spec: prepared.spec },
          pluginRegistry,
          "dry-run",
        )
        if (composed._tag === "failed") {
          return launchConfigFailedFromDiagnostics(
            request,
            composed.diagnostics,
            launchCompanionDiagnosticSummary(composed.diagnostics),
          )
        }
        const readiness = yield* sessionReadiness(sessiond)
        return {
          _tag: "LaunchDryRunOk",
          selection: launchSelection(request),
          spec: composed.spec,
          readiness,
          caveats:
            request.source?.isLocal === false
              ? [
                  "Remote-source dry-run resolves the local stream policy only; it does not prepare the peer or write a launch intent.",
                ]
              : [],
        } satisfies ControlDryRunLaunchResult
      }),
    launchGame: request =>
      Effect.gen(function* () {
        const resolved = yield* resolveLaunch(librarySource, request)
        if (resolved._tag === "failed") return resolved.result
        const prepared = yield* prepareResolvedLaunch(
          resolved.resolved,
          pluginRegistry,
          "commit",
        )
        if (prepared._tag === "failed") {
          return launchConfigFailedFromDiagnostics(
            request,
            prepared.diagnostics,
            launchPrepareDiagnosticSummary(prepared.diagnostics),
          )
        }
        const launchId = crypto.randomUUID()
        const composed = yield* composeResolvedLaunch(
          { ...resolved.resolved, spec: prepared.spec },
          pluginRegistry,
          launchId,
        )
        if (composed._tag === "failed") {
          return launchConfigFailedFromDiagnostics(
            request,
            composed.diagnostics,
            launchCompanionDiagnosticSummary(composed.diagnostics),
          )
        }
        const result = yield* runResolvedLaunch(launcher, {
          ...resolved.resolved,
          spec: composed.spec,
          extras: { ...(resolved.resolved.extras ?? {}), launchId },
        })
        return controlLaunchResultFromLaunchResult(request, result)
      }),
    sessionStatus: () => sessionStatus(sessiond),
    stopSession: request =>
      stopSession(request, sessiond, {
        pollCount: stopSessionSettlePolls,
        pollDelayMs: stopSessionSettlePollDelayMs,
      }),
    freezeSession: request => freezeSession(request, sessiond),
    thawSession: request => thawSession(request, sessiond),
    daemonStatus: () =>
      Effect.succeed({
        _tag: "DaemonAvailable" as const,
        serverId: process.env.KORRI_DAEMON_ID ?? "local",
        displayName: process.env.KORRI_DAEMON_NAME ?? "Korri Daemon",
      }),
    streamRuntimeSettingsStatus: () =>
      Effect.succeed({
        _tag: "StreamRuntimeSettingsUnavailable" as const,
        message:
          "stream runtime settings are exposed by the app stream-control RPC adapter",
      }),
  }
}

function listPlayableEntries(source: LibrarySourceService) {
  return source.listPlayableEntries
    ? source.listPlayableEntries()
    : source.list().pipe(Effect.map(games => games.map(gameToPlayableEntry)))
}

function gameToPlayableEntry(game: ResolvedGameRecord): PlayableLibraryEntry {
  return {
    id: game.id,
    itemId: game.id,
    title: game.metadata?.name ?? game.id,
    releases: [
      {
        id: "default",
        system: game.system,
        launchable:
          game.contentPath !== undefined || game.content !== undefined,
        ...(game.contentPath !== undefined
          ? {
              target: {
                kind: "file" as const,
                storage: "legacy",
                path: game.contentPath,
              },
            }
          : {}),
      },
    ],
    launchable: game.contentPath !== undefined || game.content !== undefined,
    metadata: game.metadata,
  }
}

type ControlResolveLaunchFailure =
  | Extract<ControlDryRunLaunchResult, { readonly _tag: "LaunchConfigFailed" }>
  | Extract<ControlFindGameResult, { readonly _tag: "GameNotFound" }>

function resolveLaunch(
  source: LibrarySourceService,
  request: ControlDryRunLaunchRequest | ControlLaunchRequest,
): Effect.Effect<
  | { readonly _tag: "resolved"; readonly resolved: ResolvedLaunch }
  | { readonly _tag: "failed"; readonly result: ControlResolveLaunchFailure },
  never
> {
  return source.resolveLaunchForGame(request.id, launchInputs(request)).pipe(
    Effect.match({
      onFailure: (error: LibraryError) => ({
        _tag: "failed" as const,
        result:
          error.reason === "config"
            ? {
                _tag: "LaunchConfigFailed" as const,
                selection: launchSelection(request),
                message: error.message ?? "launch configuration failed",
                ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}),
              }
            : {
                _tag: "GameNotFound" as const,
                query: request.id,
                candidates: [],
              },
      }),
      onSuccess: resolved => ({ _tag: "resolved" as const, resolved }),
    }),
  )
}

function composeResolvedLaunch(
  resolved: ResolvedLaunch,
  registry: PluginRegistry,
  launchId: string,
): Effect.Effect<
  | { readonly _tag: "resolved"; readonly spec: ResolvedLaunch["spec"] }
  | {
      readonly _tag: "failed"
      readonly diagnostics: readonly LaunchCompanionDiagnostic[]
    },
  never
> {
  return composeLaunchCompanions({
    spec: resolved.spec,
    launchCompanions: resolved.launchCompanions,
    registry,
    options: { launchMetadata: resolved.launchMetadata, launchId },
  }).pipe(
    Effect.map(result =>
      result._tag === "LaunchCompanionsComposed"
        ? { _tag: "resolved" as const, spec: result.spec }
        : { _tag: "failed" as const, diagnostics: result.diagnostics },
    ),
  )
}

function prepareResolvedLaunch(
  resolved: ResolvedLaunch,
  registry: PluginRegistry,
  mode: LaunchPrepareMode,
): Effect.Effect<
  | { readonly _tag: "resolved"; readonly spec: ResolvedLaunch["spec"] }
  | {
      readonly _tag: "failed"
      readonly diagnostics: readonly LaunchPrepareDiagnostic[]
    },
  never
> {
  return prepareLaunch({
    spec: resolved.spec,
    launchPrepare: resolved.launchPrepare,
    registry,
    options: { mode, launchMetadata: resolved.launchMetadata },
  }).pipe(
    Effect.map(result =>
      result._tag === "LaunchPrepared"
        ? { _tag: "resolved" as const, spec: result.spec }
        : { _tag: "failed" as const, diagnostics: result.diagnostics },
    ),
  )
}

function launchConfigFailedFromDiagnostics(
  request: ControlDryRunLaunchRequest | ControlLaunchRequest,
  diagnostics: readonly (LaunchCompanionDiagnostic | LaunchPrepareDiagnostic)[],
  message: string,
): Extract<ControlDryRunLaunchResult, { readonly _tag: "LaunchConfigFailed" }> {
  return {
    _tag: "LaunchConfigFailed",
    selection: launchSelection(request),
    message,
    diagnostics,
  }
}

function launchInputs(
  request: ControlDryRunLaunchRequest | ControlLaunchRequest,
): ResolveLaunchInputs {
  return {
    ...(request.releaseId !== undefined
      ? { releaseId: request.releaseId }
      : {}),
    ...(request.appId !== undefined ? { appId: request.appId } : {}),
    ...(request.userId !== undefined ? { userId: request.userId } : {}),
    ...(request.profileId !== undefined
      ? { profileId: request.profileId }
      : {}),
    ...(request.override !== undefined ? { override: request.override } : {}),
  }
}

function launchSelection(
  request: ControlDryRunLaunchRequest | ControlLaunchRequest,
) {
  return {
    id: request.id,
    ...(request.releaseId !== undefined
      ? { releaseId: request.releaseId }
      : {}),
    ...(request.appId !== undefined ? { appId: request.appId } : {}),
    ...(request.userId !== undefined ? { userId: request.userId } : {}),
    ...(request.profileId !== undefined
      ? { profileId: request.profileId }
      : {}),
  }
}

function sessionReadiness(
  options: SessiondManagedLaunchClientOptions | undefined,
): Effect.Effect<ControlSessionReadiness, never> {
  return probeSessiond(options).pipe(
    Effect.map(probe => {
      const terminal = sessiondTerminalFromFailure(probe)
      if (terminal) return terminal
      if (probe.kind !== "ok") return unexpectedSessiondProbe(probe)
      if (isLaunchReadyMode(probe.status.mode)) {
        return { _tag: "SessionReady" as const, mode: probe.status.mode }
      }
      return { _tag: "SessionBusy" as const, mode: probe.status.mode }
    }),
  )
}

function sessionStatus(
  options: SessiondManagedLaunchClientOptions | undefined,
): Effect.Effect<ControlSessionStatusResult, never> {
  return probeSessiond(options).pipe(
    Effect.map(probe => {
      const terminal = sessiondTerminalFromFailure(probe)
      if (terminal) return terminal
      if (probe.kind !== "ok") return unexpectedSessiondProbe(probe)
      return {
        _tag: "SessionStatus" as const,
        configured: true as const,
        mode: probe.status.mode,
        ...(probe.status.active
          ? {
              active: {
                launchId: probe.status.active.launchId,
                mode: probe.status.active.mode,
                ...(probe.status.active.phase
                  ? { phase: probe.status.active.phase }
                  : {}),
                // Game identity from the @korri:game launch annotation;
                // populates the (previously always-empty) gameId/title
                // fields on ControlSessionActive.
                ...gameIdentityFromLaunchMetadata(
                  probe.status.active.launchMetadata,
                ),
              },
            }
          : {}),
        restoreAttempts: probe.status.restoreAttempts,
        ...(probe.status.failureReason
          ? { failureReason: probe.status.failureReason }
          : {}),
      }
    }),
  )
}

function stopSession(
  request: ControlStopSessionRequest,
  options: SessiondManagedLaunchClientOptions | undefined,
  settle: { readonly pollCount: number; readonly pollDelayMs: number },
): Effect.Effect<ControlStopSessionResult, never> {
  const force = request.force === true
  if (request.confirmed !== true) {
    return Effect.succeed({
      _tag: "ConfirmationRequired",
      action: force ? "force-stop-session" : "stop-session",
    })
  }

  return Effect.gen(function* () {
    const status = yield* probeSessiond(options)
    const statusTerminal = sessiondTerminalFromFailure(status)
    if (statusTerminal) return statusTerminal
    if (status.kind !== "ok") return unexpectedSessiondProbe(status)
    const launchId = status.status.active?.launchId
    if (!launchId) return { _tag: "NothingToStop" as const }

    const terminated = yield* Effect.promise(() =>
      terminateSessiondManagedLaunch(
        { launchId, ...(force ? { force } : {}) },
        options ?? {},
      ),
    ).pipe(
      Effect.catchCause(cause =>
        Effect.succeed({
          kind: "unavailable" as const,
          message: errorMessage(Cause.squash(cause)),
        }),
      ),
    )

    const terminatedTerminal = sessiondTerminalFromFailure(terminated)
    if (terminatedTerminal) return terminatedTerminal
    if (terminated.kind !== "ok") return unexpectedSessiondProbe(terminated)
    if (terminated.response.status === "accepted") {
      return yield* waitForSessionStopCompletion({
        launchId: terminated.response.launchId,
        force,
        options,
        pollCount: settle.pollCount,
        pollDelayMs: settle.pollDelayMs,
      })
    }
    return { _tag: "NothingToStop" as const }
  })
}

function freezeSession(
  request: ControlFreezeSessionRequest,
  options: SessiondManagedLaunchClientOptions | undefined,
): Effect.Effect<ControlFreezeSessionResult, never> {
  return freezeControlCall({
    request,
    options,
    call: (launchId, clientOptions) =>
      freezeSessiondManagedLaunch({ launchId }, clientOptions),
    already: "already-frozen",
    alreadyTag: "AlreadyFrozen",
    appliedTag: "Frozen",
  })
}

function thawSession(
  request: ControlThawSessionRequest,
  options: SessiondManagedLaunchClientOptions | undefined,
): Effect.Effect<ControlThawSessionResult, never> {
  return freezeControlCall({
    request,
    options,
    call: (launchId, clientOptions) =>
      thawSessiondManagedLaunch({ launchId }, clientOptions),
    already: "already-thawed",
    alreadyTag: "AlreadyThawed",
    appliedTag: "Thawed",
  })
}

// Shared control flow for the freeze/thaw mutations: probe status, gate on
// the launchFreeze capability, resolve the target launch, then map the
// sessiond response union onto the control result union. The two commands
// differ only in the client call and tag vocabulary.
function freezeControlCall<
  AppliedTag extends "Frozen" | "Thawed",
  AlreadyTag extends "AlreadyFrozen" | "AlreadyThawed",
>(input: {
  readonly request: ControlFreezeSessionRequest
  readonly options: SessiondManagedLaunchClientOptions | undefined
  readonly call: (
    launchId: string,
    options: SessiondManagedLaunchClientOptions,
  ) => Promise<
    SessiondManagedLaunchFreezeResult | SessiondManagedLaunchThawResult
  >
  readonly already: "already-frozen" | "already-thawed"
  readonly alreadyTag: AlreadyTag
  readonly appliedTag: AppliedTag
}): Effect.Effect<
  | { readonly _tag: AppliedTag; readonly launchId: string }
  | { readonly _tag: AlreadyTag; readonly launchId: string }
  | { readonly _tag: "NothingActive" }
  | { readonly _tag: "Unsupported"; readonly message?: string }
  | { readonly _tag: "SessiondNotConfigured" }
  | { readonly _tag: "HostUnavailable"; readonly message?: string },
  never
> {
  return Effect.gen(function* () {
    const status = yield* probeSessiond(input.options)
    const statusTerminal = sessiondTerminalFromFailure(status)
    if (statusTerminal) return statusTerminal
    if (status.kind !== "ok") return unexpectedSessiondProbe(status)
    if (status.status.capabilities.launchFreeze !== true) {
      return {
        _tag: "Unsupported" as const,
        message: "sessiond does not support launch freeze",
      }
    }
    const launchId = input.request.launchId ?? status.status.active?.launchId
    if (!launchId) return { _tag: "NothingActive" as const }

    const outcome = yield* Effect.promise(() =>
      input.call(launchId, input.options ?? {}),
    ).pipe(
      Effect.catchCause(cause =>
        Effect.succeed({
          kind: "unavailable" as const,
          message: errorMessage(Cause.squash(cause)),
        }),
      ),
    )

    const outcomeTerminal = sessiondTerminalFromFailure(outcome)
    if (outcomeTerminal) return outcomeTerminal
    if (outcome.kind !== "ok") return unexpectedSessiondProbe(outcome)
    const response = outcome.response
    switch (response.status) {
      case "accepted":
        return { _tag: input.appliedTag, launchId: response.launchId }
      case "not-found":
        return { _tag: "NothingActive" as const }
      case "unsupported":
        return { _tag: "Unsupported" as const, message: response.message }
      default:
        // already-frozen / already-thawed -- the only remaining variants.
        return response.status === input.already
          ? { _tag: input.alreadyTag, launchId: response.launchId }
          : { _tag: "NothingActive" as const }
    }
  })
}

function waitForSessionStopCompletion(input: {
  readonly launchId: string
  readonly force: boolean
  readonly options: SessiondManagedLaunchClientOptions | undefined
  readonly pollCount: number
  readonly pollDelayMs: number
}): Effect.Effect<ControlStopSessionResult, never> {
  return Effect.gen(function* () {
    let lastStatus:
      | Extract<SessiondManagedLaunchStatusResult, { readonly kind: "ok" }>
      | undefined
    for (
      let attempt = 0;
      attempt < Math.max(1, input.pollCount);
      attempt += 1
    ) {
      if (attempt > 0 && input.pollDelayMs > 0) {
        yield* Effect.promise(() => delay(input.pollDelayMs))
      }
      const probe = yield* probeSessiond(input.options)
      const terminal = sessiondTerminalFromFailure(probe)
      if (terminal) {
        return {
          _tag: "StopPending" as const,
          launchId: input.launchId,
          force: input.force,
          message:
            terminal._tag === "HostUnavailable"
              ? (terminal.message ?? "sessiond unavailable after stop request")
              : "sessiond not configured after stop request",
        }
      }
      if (probe.kind !== "ok") continue
      lastStatus = probe
      const active = probe.status.active
      if (!active || active.launchId !== input.launchId) {
        return {
          _tag: "Stopped" as const,
          launchId: input.launchId,
          force: input.force,
        }
      }
    }

    const active = lastStatus?.status.active
    return {
      _tag: "StopPending" as const,
      launchId: input.launchId,
      force: input.force,
      ...(active?.mode ? { mode: active.mode } : {}),
      ...(active?.phase ? { phase: active.phase } : {}),
    }
  })
}

function probeSessiond(
  options: SessiondManagedLaunchClientOptions | undefined,
) {
  return Effect.promise(() => probeSessiondManagedLaunchStatus(options)).pipe(
    Effect.catchCause(cause =>
      Effect.succeed({
        kind: "unavailable" as const,
        message: errorMessage(Cause.squash(cause)),
      }),
    ),
  ) as Effect.Effect<SessiondManagedLaunchStatusResult, never>
}

type SessiondTerminal =
  | { readonly _tag: "SessiondNotConfigured" }
  | { readonly _tag: "HostUnavailable"; readonly message?: string }

function sessiondTerminalFromFailure(result: {
  readonly kind: string
  readonly message?: string
}): SessiondTerminal | undefined {
  if (result.kind === "not-configured") {
    return { _tag: "SessiondNotConfigured" }
  }
  if (result.kind === "unavailable" || result.kind === "invalid-payload") {
    return {
      _tag: "HostUnavailable",
      ...(result.message ? { message: result.message } : {}),
    }
  }
  return undefined
}

function unexpectedSessiondProbe(value: unknown) {
  return {
    _tag: "HostUnavailable" as const,
    message: `unhandled sessiond result: ${JSON.stringify(value)}`,
  }
}

function runResolvedLaunch(
  launcher: LauncherService,
  resolved: ResolvedLaunch,
): Effect.Effect<LaunchResult, never> {
  if (launcher.spawn) {
    const extras = launchExtrasForResolvedLaunch(resolved)
    return launcher.spawn(resolved.spec, extras ? { extras } : undefined).pipe(
      Effect.matchEffect({
        onFailure: error => Effect.succeed(libraryErrorToLaunchResult(error)),
        onSuccess: result => managedLaunchResult(result),
      }),
    )
  }
  return launcher.run(resolved.spec).pipe(
    Effect.match({
      onFailure: error => libraryErrorToLaunchResult(error),
      onSuccess: result => result,
    }),
  )
}

function launchExtrasForResolvedLaunch(
  resolved: ResolvedLaunch,
): ResolvedLaunch["extras"] | undefined {
  if (
    !resolved.extras &&
    !resolved.launchMetadata &&
    !resolved.launchCompanions &&
    !resolved.hooks
  )
    return undefined
  return {
    ...(resolved.extras ?? {}),
    ...(resolved.launchMetadata
      ? { launchMetadata: resolved.launchMetadata }
      : {}),
    ...(resolved.launchCompanions
      ? { launchCompanions: resolved.launchCompanions }
      : {}),
    ...(resolved.hooks ? { hooks: resolved.hooks } : {}),
  }
}

function managedLaunchResult(
  result: ManagedLaunchResult,
): Effect.Effect<LaunchResult, never> {
  if (result.status === "failed") return Effect.succeed(result.result)
  return Effect.promise(() => result.result).pipe(
    Effect.catchCause(cause =>
      Effect.succeed({
        status: "failed" as const,
        exitCode: launchFailureExitCode("command-failed"),
        failureKind: "command-failed" as const,
        stderrTail: errorMessage(Cause.squash(cause)),
      }),
    ),
  )
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function libraryErrorToLaunchResult(error: LibraryError): LaunchResult {
  return {
    status: "failed",
    exitCode: launchFailureExitCode(
      error.reason === "unavailable" ? "host-unavailable" : "command-failed",
    ),
    failureKind:
      error.reason === "unavailable" ? "host-unavailable" : "command-failed",
    stderrTail: error.message ?? error.diagnostic,
  }
}

function controlLaunchResultFromLaunchResult(
  request: ControlLaunchRequest,
  result: LaunchResult,
): ControlLaunchResult {
  const selection = launchSelection(request)
  if (result.status === "launched") return { _tag: "Launched", selection }
  if (result.failureKind === "session-busy") {
    return {
      _tag: "DaemonRejected",
      selection,
      message: result.stderrTail ?? "session is busy",
    }
  }
  if (
    result.failureKind === "host-unavailable" ||
    result.failureKind === "host-control-disabled"
  ) {
    return {
      _tag: "HostUnavailable",
      selection,
      message: result.stderrTail ?? "host control is unavailable",
    }
  }
  return {
    _tag: "LaunchFailed",
    selection,
    exitCode: result.exitCode,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    ...(result.stderrTail ? { stderrTail: result.stderrTail } : {}),
  }
}
