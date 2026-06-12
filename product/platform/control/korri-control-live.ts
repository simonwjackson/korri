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
  probeSessiondManagedLaunchStatus,
  type SessiondManagedLaunchClientOptions,
  type SessiondManagedLaunchStatusResult,
  terminateSessiondManagedLaunch,
} from "@platform/library/sessiond-managed-launch-client"
import { isLaunchReadyMode } from "@platform/library/sessiond-managed-launch-protocol"
import { Cause, Effect, Layer } from "effect"
import type {
  ControlDryRunLaunchRequest,
  ControlLaunchRequest,
  ControlStopSessionRequest,
} from "./control-requests"
import type {
  ControlDryRunLaunchResult,
  ControlFindGameResult,
  ControlLaunchResult,
  ControlListGamesResult,
  ControlSessionReadiness,
  ControlSessionStatusResult,
  ControlStopSessionResult,
} from "./control-results"
import {
  findPlayableEntry,
  KorriControl,
  type KorriControlService,
} from "./korri-control"

export interface KorriControlLiveOptions {
  readonly sessiond?: SessiondManagedLaunchClientOptions
}

export const KorriControlLayerLive = Layer.effect(KorriControl)(
  Effect.gen(function* () {
    const librarySource = yield* LibrarySource
    const launcher = yield* Launcher
    return makeKorriControlLive({ librarySource, launcher })
  }),
)

export function makeKorriControlLive(options: {
  readonly librarySource: LibrarySourceService
  readonly launcher: LauncherService
  readonly sessiond?: SessiondManagedLaunchClientOptions
}): KorriControlService {
  const { librarySource, launcher, sessiond } = options

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
        const readiness = yield* sessionReadiness(sessiond)
        return {
          _tag: "LaunchDryRunOk",
          selection: launchSelection(request),
          spec: result.resolved.spec,
          readiness,
          caveats:
            request.source?.isLocal === false
              ? [
                  "Remote-source dry-run resolves the local Moonlight policy only; it does not prepare the peer or write a launch intent.",
                ]
              : [],
        } satisfies ControlDryRunLaunchResult
      }),
    launchGame: request =>
      Effect.gen(function* () {
        const resolved = yield* resolveLaunch(librarySource, request)
        if (resolved._tag === "failed") return resolved.result
        const result = yield* runResolvedLaunch(launcher, resolved.resolved)
        return controlLaunchResultFromLaunchResult(request, result)
      }),
    sessionStatus: () => sessionStatus(sessiond),
    stopSession: request => stopSession(request, sessiond),
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
        ...(game.contentPath !== undefined ? { target: game.contentPath } : {}),
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
      return {
        _tag: "Stopped" as const,
        launchId: terminated.response.launchId,
        force,
      }
    }
    return { _tag: "NothingToStop" as const }
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
    return launcher
      .spawn(
        resolved.spec,
        resolved.extras ? { extras: resolved.extras } : undefined,
      )
      .pipe(
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
