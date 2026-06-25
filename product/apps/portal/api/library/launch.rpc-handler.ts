import { DataError, NotFoundError } from "@platform/api/rpc/errors"
import {
  type LaunchExtras,
  type LaunchFailureKind,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import {
  Launcher,
  LibraryError,
  LibrarySource,
  type ResolvedLaunch,
} from "@platform/library/library-services"
import { logger } from "@platform/logger/logger"
import type { PluginHandler, ProviderId } from "@platform/plugin"
import { runPluginHandler } from "@platform/plugin"
import {
  composeLaunchCompanions,
  type LaunchCompanionDiagnostic,
  launchCompanionDiagnosticSummary,
} from "@platform/plugin/launch-companion"
import {
  moonlightControlEnvForHandle,
  moonlightControlHandleFromOptions,
} from "@product/apps/portal/stream/moonlight-launcher"
import type { RemotePrepareResult } from "@product/apps/portal/stream/remote-stream-client"
import { createFirstPartyPluginRegistryFromEnv } from "@product/plugins"
import { Effect } from "effect"

import {
  composeMoonlightLaunchSpec,
  moonlightHostFromControlUrl,
  resolveMoonlightLaunchInputDevice,
} from "../stream/compose-moonlight-launch-spec"
import { ForegroundSessionHost } from "./foreground-session-host-layer"
import type { LaunchLibraryPayload, LaunchLibraryResponse } from "./launch.rpc"
import { launchLocalForegroundSession } from "./local-foreground-launch-adapter"
import { RemoteStreamPrepare } from "./remote-stream-prepare"

type FailedLaunchLibraryResponse = Extract<
  LaunchLibraryResponse,
  { readonly status: "failed" }
>

type LaunchResolutionResult =
  | { readonly _tag: "resolved"; readonly resolved: ResolvedLaunch }
  | { readonly _tag: "failed"; readonly response: FailedLaunchLibraryResponse }

export const handleLaunchLibrary = (
  payload: typeof LaunchLibraryPayload.Type,
) =>
  Effect.gen(function* () {
    // Federation routing: remote-source entries dispatch a Moonlight
    // launch through the same `Launcher` / `ForegroundSessionHost` seam
    // used by local launches. The peer's `app.server.stream.prepare` is
    // invoked first to register the launch intent on the source-machine.
    if (payload.source && payload.source.isLocal === false) {
      return yield* handleRemoteSourceLaunch(payload, payload.source)
    }

    const source = yield* LibrarySource
    const launcher = yield* Launcher
    const foregroundSessionHost = yield* ForegroundSessionHost

    const resolvedResult = yield* source
      .resolveLaunchForGame(payload.id, {
        releaseId: payload.releaseId,
        appId: payload.appId,
        userId: payload.userId,
        profileId: payload.profileId,
        presetId: payload.presetId ?? undefined,
        override: payload.override,
      })
      .pipe(
        Effect.matchEffect({
          onSuccess: resolved =>
            Effect.succeed({ _tag: "resolved" as const, resolved }),
          onFailure: (
            error: LibraryError,
          ): Effect.Effect<
            LaunchResolutionResult,
            DataError | NotFoundError
          > => {
            if (isPlayableNotFound(error)) {
              logger.warn(
                { id: payload.id },
                "app.library.launch: unknown id; nothing to spawn",
              )
              return Effect.fail(
                new NotFoundError({
                  message: `Unknown game id: ${payload.id}`,
                }),
              )
            }
            return error.reason === "config"
              ? Effect.succeed({
                  _tag: "failed" as const,
                  response: launchConfigurationFailure(error),
                })
              : Effect.fail(toDataError(error))
          },
        }),
      )

    if (resolvedResult._tag === "failed") {
      logger.warn(
        { id: payload.id, diagnostic: resolvedResult.response.stderrTail },
        "app.library.launch: launch configuration failed",
      )
      return resolvedResult.response
    }

    const launchId = globalThis.crypto.randomUUID()
    const specResult = yield* composeLaunchCompanions({
      spec: resolvedResult.resolved.spec,
      launchCompanions: resolvedResult.resolved.launchCompanions,
      registry: createFirstPartyPluginRegistryFromEnv(process.env),
      options: {
        launchMetadata: resolvedResult.resolved.launchMetadata,
        launchId,
      },
    })
    if (specResult._tag === "LaunchCompanionDiagnostics") {
      const response = launchConfigurationFailureFromDiagnostics(
        specResult.diagnostics,
      )
      logger.warn(
        { id: payload.id, diagnostics: specResult.diagnostics },
        "app.library.launch: launch companion preflight failed",
      )
      return response
    }
    const spec = specResult.spec
    yield* openLifecycleCorrelationForLaunch({
      launchId,
      playableId: payload.id,
      launchMetadata: resolvedResult.resolved.launchMetadata,
    }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.void,
        onSuccess: () => Effect.void,
      }),
    )

    const result = yield* Effect.tryPromise({
      try: () =>
        launchLocalForegroundSession(foregroundSessionHost.owner, {
          id: payload.id,
          spec,
          artifacts: resolvedResult.resolved.artifacts,
          launchId,
          spawn: async () => {
            if (!launcher.spawn) return unsupportedManagedSpawn()
            // task-014: forward launcher-anchor extras (lifecycle,
            // wait) when the library source supplies them. Resolved
            // launches without extras (the common case today) are
            // unchanged — the sessiond launcher treats absent
            // `lifecycle` as foreground for back-compat.
            const launchExtras = launchExtrasForResolvedLaunch(
              resolvedResult.resolved,
              launchId,
            )
            const spawnOptions = launchExtras
              ? { extras: launchExtras }
              : undefined
            return await Effect.runPromise(
              launcher
                .spawn(spec, spawnOptions)
                .pipe(Effect.mapError(toDataError)),
            )
          },
        }),
      catch: error => toDataError(toLibraryError(error)),
    })

    if (result.status === "launched") {
      logger.info(
        { id: payload.id, command: spec.command, exitCode: 0 },
        "app.library.launch: launched",
      )
      return {
        _tag: "Accepted",
        status: "launched",
      } satisfies LaunchLibraryResponse
    }

    logger.warn(
      {
        id: payload.id,
        command: spec.command,
        exitCode: result.exitCode,
        responseTag: result._tag,
      },
      "app.library.launch: failed",
    )
    return result
  })

const LAUNCH_CONFIG_ERROR_EXIT_CODE = 124
const LIFECYCLE_CORRELATE_OPERATION = "lifecycle.correlate" as const
const LIFECYCLE_CORRELATE_CAPABILITY = "lifecycle.correlate" as const

function openLifecycleCorrelationForLaunch(input: {
  readonly launchId: string
  readonly playableId: string
  readonly launchMetadata: ResolvedLaunch["launchMetadata"]
}) {
  return Effect.gen(function* () {
    const providerId = input.launchMetadata?.appProviderId
    if (!providerId) return
    const appId = appIdFromProviderAnnotation(input.launchMetadata, providerId)
    if (!appId) return
    const registry = createFirstPartyPluginRegistryFromEnv(process.env)
    const plugin = registry.get(providerId)
    if (!plugin || !registry.enabledPluginIds.has(providerId)) return
    const handler = plugin.handlers.find(isLifecycleCorrelateHandler) as
      | PluginHandler<typeof LIFECYCLE_CORRELATE_OPERATION, unknown, unknown>
      | undefined
    if (!handler) return
    yield* runPluginHandler(handler, {
      operation: LIFECYCLE_CORRELATE_OPERATION,
      provider: providerId,
      input: {
        appId,
        launchId: input.launchId,
        playableId: input.playableId,
      },
    })
  })
}

function isLifecycleCorrelateHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === LIFECYCLE_CORRELATE_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(LIFECYCLE_CORRELATE_CAPABILITY))
  )
}

function appIdFromProviderAnnotation(
  launchMetadata: ResolvedLaunch["launchMetadata"],
  providerId: ProviderId,
): string | undefined {
  const annotation = launchMetadata?.annotations?.[providerId]
  if (!isRecord(annotation)) return undefined
  const cleanup = annotation.foregroundCleanup
  if (isRecord(cleanup) && typeof cleanup.appId === "string") {
    return cleanup.appId
  }
  return typeof annotation.appId === "string" ? annotation.appId : undefined
}

function launchExtrasForResolvedLaunch(
  resolved: ResolvedLaunch,
  launchId: string,
): LaunchExtras | undefined {
  if (
    !resolved.extras &&
    !resolved.launchMetadata &&
    !resolved.launchCompanions &&
    !launchId
  )
    return undefined
  return {
    ...(resolved.extras ?? {}),
    launchId,
    ...(resolved.launchMetadata
      ? { launchMetadata: resolved.launchMetadata }
      : {}),
    ...(resolved.launchCompanions
      ? { launchCompanions: resolved.launchCompanions }
      : {}),
  }
}

function unsupportedManagedSpawn(): ManagedLaunchResult {
  return {
    status: "failed",
    result: {
      status: "failed",
      exitCode: launchFailureExitCode("command-failed"),
      failureKind: "command-failed",
      stderrTail: "configured launcher does not support managed spawn",
    },
  }
}

function isPlayableNotFound(error: LibraryError): boolean {
  return (
    error.reason === "config" &&
    error.message?.startsWith("PlayableNotFound") === true
  )
}

function launchConfigurationFailure(
  error: LibraryError,
): FailedLaunchLibraryResponse {
  return {
    _tag: "LaunchFailed",
    status: "failed",
    exitCode: LAUNCH_CONFIG_ERROR_EXIT_CODE,
    stderrTail:
      error.message ?? error.diagnostic ?? "launch configuration failed",
  }
}

function launchConfigurationFailureFromDiagnostics(
  diagnostics: readonly LaunchCompanionDiagnostic[],
): FailedLaunchLibraryResponse {
  return {
    _tag: "LaunchFailed",
    status: "failed",
    exitCode: LAUNCH_CONFIG_ERROR_EXIT_CODE,
    stderrTail: launchCompanionDiagnosticSummary(diagnostics),
    diagnostics: [...diagnostics],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function moonlightRequiresInputPlumber(): boolean {
  const raw = process.env.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER?.trim()
  return raw === "1" || raw === "true" || raw === "required"
}

function toLibraryError(error: unknown): LibraryError {
  return error instanceof LibraryError
    ? error
    : new LibraryError({
        reason: "io",
        message: error instanceof Error ? error.message : String(error),
      })
}

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library launch failed"
  return new DataError({
    reason: "Unavailable",
    message,
  })
}

/**
 * Dispatch a remote-source (Moonlight) launch through sessiond.
 *
 * 1. Validate the peer `controlUrl` is non-empty.
 * 2. Call the peer's `app.server.stream.prepare` to register the launch
 *    intent on the source-machine.
 * 3. Compose a `moonlight stream -app "Korri Stream" <host>` LaunchSpec and
 *    apply generic launch companions from the local launcher policy.
 * 4. Dispatch through the same `launchLocalForegroundSession` seam that
 *    local launches use. The Launcher service routes to sessiond on kiosk
 *    images where `KORRI_SESSIOND_SOCKET` is set.
 *
 * The local proseql library is intentionally NOT consulted: the federated
 * game id originates on the peer and may not be present in this server's
 * local library list.
 */
function handleRemoteSourceLaunch(
  payload: typeof LaunchLibraryPayload.Type,
  source: NonNullable<(typeof LaunchLibraryPayload.Type)["source"]>,
) {
  return Effect.gen(function* () {
    if (!source.controlUrl || source.controlUrl.trim().length === 0) {
      logger.warn(
        { id: payload.id, peerHostId: source.hostId },
        "app.library.launch: remote-source payload missing controlUrl",
      )
      return launchFailedFromKind(
        "host-unavailable",
        "remote-source payload missing peer controlUrl",
      )
    }

    const remotePrepare = yield* RemoteStreamPrepare
    const launcher = yield* Launcher
    const foregroundSessionHost = yield* ForegroundSessionHost
    const localLibrarySource = yield* LibrarySource

    const prepareResult = yield* remotePrepare.prepare(
      source.controlUrl,
      payload.id,
      {
        ...(payload.releaseId !== undefined
          ? { releaseId: payload.releaseId }
          : {}),
        ...(payload.userId !== undefined ? { userId: payload.userId } : {}),
        ...(payload.profileId !== undefined
          ? { profileId: payload.profileId }
          : {}),
        ...(typeof payload.presetId === "string"
          ? { presetId: payload.presetId }
          : {}),
        ...(payload.override !== undefined
          ? { override: payload.override }
          : {}),
      },
    )

    if (prepareResult.status === "failed") {
      logger.warn(
        {
          id: payload.id,
          peerHostId: source.hostId,
          peerControlUrl: source.controlUrl,
          category: prepareResult.category,
        },
        "app.library.launch: peer prepare failed",
      )
      return launchFailedFromKind(
        remotePrepareCategoryToFailureKind(prepareResult.category),
        `peer ${source.hostId} failed to prepare launch: ${prepareResult.message}`,
      )
    }

    const host = moonlightHostFromPeerControlUrl(source.controlUrl)
    if (host === undefined) {
      logger.warn(
        { id: payload.id, peerControlUrl: source.controlUrl },
        "app.library.launch: peer controlUrl could not be parsed",
      )
      return launchFailedFromKind(
        "host-unavailable",
        `peer controlUrl is not a parseable URL: ${source.controlUrl}`,
      )
    }

    const localPolicyResult =
      yield* localLibrarySource.resolveLocalLauncherPolicy
        ? localLibrarySource
            .resolveLocalLauncherPolicy("moonlight", {
              override: payload.override,
            })
            .pipe(
              Effect.match({
                onSuccess: policy => ({ _tag: "resolved" as const, policy }),
                onFailure: (error: LibraryError) => ({
                  _tag: "failed" as const,
                  response: launchConfigurationFailure(error),
                }),
              }),
            )
        : Effect.succeed({
            _tag: "failed" as const,
            response: launchConfigurationFailure(
              new LibraryError({
                reason: "config",
                message:
                  "LibrarySource does not support local launcher policy resolution for Moonlight remote-source launches",
              }),
            ),
          })
    if (localPolicyResult._tag === "failed") return localPolicyResult.response
    const localPolicy = localPolicyResult.policy

    const inputDevice = yield* Effect.tryPromise({
      try: () =>
        resolveMoonlightLaunchInputDevice({
          requireInputPlumberInput: moonlightRequiresInputPlumber(),
        }),
      catch: error => toDataError(toLibraryError(error)),
    })
    if (inputDevice.status === "failed") {
      logger.warn(
        {
          id: payload.id,
          peerHostId: source.hostId,
          failureKind: inputDevice.failureKind,
        },
        "app.library.launch: remote-source moonlight input unavailable",
      )
      return launchFailedFromKind(inputDevice.failureKind, inputDevice.message)
    }

    const moonlightControl = yield* Effect.tryPromise({
      try: () =>
        moonlightControlHandleFromOptions(
          undefined,
          localPolicy.moonlight?.control,
        ),
      catch: error => toDataError(toLibraryError(error)),
    })
    const moonlightSpecResult = yield* Effect.try({
      try: () =>
        composeMoonlightLaunchSpec({
          host,
          moonlight: localPolicy.moonlight,
          ...(inputDevice.path ? { inputDevices: [inputDevice.path] } : {}),
          ...(moonlightControl
            ? { environment: moonlightControlEnvForHandle(moonlightControl) }
            : {}),
        }),
      catch: error => error,
    }).pipe(
      Effect.match({
        onSuccess: spec => ({ _tag: "resolved" as const, spec }),
        onFailure: error => ({
          _tag: "failed" as const,
          response: launchConfigurationFailure(
            new LibraryError({
              reason: "config",
              message: errorMessage(error),
            }),
          ),
        }),
      }),
    )
    if (moonlightSpecResult._tag === "failed")
      return moonlightSpecResult.response

    const launchId = globalThis.crypto.randomUUID()
    const specResult = yield* composeLaunchCompanions({
      spec: moonlightSpecResult.spec,
      launchCompanions: localPolicy.launchCompanions,
      registry: createFirstPartyPluginRegistryFromEnv(process.env),
      options: { launchId },
    })
    if (specResult._tag === "LaunchCompanionDiagnostics") {
      return launchConfigurationFailureFromDiagnostics(specResult.diagnostics)
    }
    const spec: LaunchSpec = specResult.spec

    const result = yield* Effect.tryPromise({
      try: () =>
        launchLocalForegroundSession(foregroundSessionHost.owner, {
          id: payload.id,
          spec,
          launchId,
          spawn: async () => {
            if (!launcher.spawn) return unsupportedManagedSpawn()
            return await Effect.runPromise(
              launcher
                .spawn(spec, {
                  extras: {
                    launchId,
                    ...(Object.keys(localPolicy.launchCompanions).length > 0
                      ? { launchCompanions: localPolicy.launchCompanions }
                      : {}),
                  },
                })
                .pipe(Effect.mapError(toDataError)),
            )
          },
        }),
      catch: error => toDataError(toLibraryError(error)),
    })

    if (result.status === "launched") {
      logger.info(
        {
          id: payload.id,
          peerHostId: source.hostId,
          peerControlUrl: source.controlUrl,
          command: spec.command,
        },
        "app.library.launch: remote-source launched",
      )
      return {
        _tag: "Accepted",
        status: "launched",
      } satisfies LaunchLibraryResponse
    }

    logger.warn(
      {
        id: payload.id,
        peerHostId: source.hostId,
        command: spec.command,
        exitCode: result.exitCode,
      },
      "app.library.launch: remote-source failed",
    )
    return result
  })
}

function launchFailedFromKind(
  kind: LaunchFailureKind,
  message: string,
): LaunchLibraryResponse {
  // Remote-prepare failures are surfaced as `HostUnavailable` when the
  // remote peer is unreachable / request-rejected; other failure kinds tag
  // as `LaunchFailed`. Back-compat fields (status, exitCode, failureKind)
  // are preserved unchanged.
  if (kind === "host-unavailable") {
    return {
      _tag: "HostUnavailable",
      status: "failed",
      exitCode: launchFailureExitCode(kind),
      failureKind: kind,
      stderrTail: message,
      hostUnavailableReason: { kind: "network" },
    }
  }
  if (kind === "host-control-disabled") {
    return {
      _tag: "HostUnavailable",
      status: "failed",
      exitCode: launchFailureExitCode(kind),
      failureKind: kind,
      stderrTail: message,
      hostUnavailableReason: { kind: "request-rejected" },
    }
  }
  return {
    _tag: "LaunchFailed",
    status: "failed",
    exitCode: launchFailureExitCode(kind),
    failureKind: kind,
    stderrTail: message,
  }
}

function remotePrepareCategoryToFailureKind(
  category: Extract<RemotePrepareResult, { status: "failed" }>["category"],
): LaunchFailureKind {
  switch (category) {
    case "host-unavailable":
      return "host-unavailable"
    case "host-control-disabled":
      return "host-control-disabled"
    case "no-such-game":
      return "no-such-game"
    case "prepare-failed":
      return "prepare-failed"
  }
}

function moonlightHostFromPeerControlUrl(
  controlUrl: string,
): string | undefined {
  try {
    return moonlightHostFromControlUrl(controlUrl)
  } catch {
    return undefined
  }
}
