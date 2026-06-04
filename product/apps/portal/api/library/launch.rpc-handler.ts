import { DataError, NotFoundError } from "@platform/api/rpc/errors"
import {
  DEFAULT_GAMESCOPE_POLICY,
  normalizeGamescopePolicy,
} from "@platform/library/config/inheritable-fields"
import {
  type LaunchFailureKind,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import { logger } from "@platform/logger/logger"
import type { RemotePrepareResult } from "@product/apps/portal/stream/remote-stream-client"
import { Effect } from "effect"
import { composeGamescopeLaunchSpec } from "../../../../../product/services/device/game-stream-fullscreen"

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
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    if (!games.some(game => game.id === payload.id)) {
      logger.warn(
        { id: payload.id },
        "app.library.launch: unknown id; nothing to spawn",
      )
      return yield* Effect.fail(
        new NotFoundError({ message: `Unknown game id: ${payload.id}` }),
      )
    }

    const resolvedResult = yield* source
      .resolveLaunchForGame(payload.id, {
        userId: payload.userId,
        presetId: payload.presetId ?? undefined,
        override: payload.override,
      })
      .pipe(
        Effect.matchEffect({
          onSuccess: resolved =>
            Effect.succeed({ _tag: "resolved" as const, resolved }),
          onFailure: (error: LibraryError) =>
            error.reason === "config"
              ? Effect.succeed({
                  _tag: "failed" as const,
                  response: launchConfigurationFailure(error),
                })
              : Effect.fail(toDataError(error)),
        }),
      )

    if (resolvedResult._tag === "failed") {
      logger.warn(
        { id: payload.id, diagnostic: resolvedResult.response.stderrTail },
        "app.library.launch: launch configuration failed",
      )
      return resolvedResult.response
    }

    const gamescope = normalizeGamescopePolicy(
      resolvedResult.resolved.gamescope,
    )
    const spec = composeGamescopeLaunchSpec(resolvedResult.resolved.spec, {
      enabled: gamescope.enabled === true,
      ...(gamescope.command !== undefined
        ? { command: gamescope.command }
        : {}),
      ...(gamescope.backend !== undefined
        ? { backend: gamescope.backend }
        : {}),
      ...(gamescope.exposeWayland !== undefined
        ? { exposeWayland: gamescope.exposeWayland }
        : {}),
      ...(gamescope.args !== undefined ? { args: gamescope.args } : {}),
    })

    const result = yield* Effect.tryPromise({
      try: () =>
        launchLocalForegroundSession(foregroundSessionHost.owner, {
          id: payload.id,
          spec,
          artifacts: resolvedResult.resolved.artifacts,
          spawn: async () => {
            if (!launcher.spawn) return unsupportedManagedSpawn()
            // task-014: forward launcher-anchor extras (lifecycle,
            // wait) when the library source supplies them. Resolved
            // launches without extras (the common case today) are
            // unchanged — the sessiond launcher treats absent
            // `lifecycle` as foreground for back-compat.
            const spawnOptions = resolvedResult.resolved.extras
              ? { extras: resolvedResult.resolved.extras }
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
 * 3. Compose a gamescope-wrapped `moonlight stream -app "Korri Stream" <host>` LaunchSpec.
 * 4. Dispatch through the same `launchLocalForegroundSession` seam that
 *    local launches use. The Launcher service routes to sessiond on kiosk
 *    images where `KORRI_SESSIOND_URL` is set.
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

    const prepareResult = yield* remotePrepare.prepare(
      source.controlUrl,
      payload.id,
      {
        ...(payload.userId !== undefined ? { userId: payload.userId } : {}),
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
        prepareResult.message,
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

    const inputDevice = yield* Effect.tryPromise({
      try: () => resolveMoonlightLaunchInputDevice(),
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

    // v1: default gamescope policy. Per-launcher policy ("moonlight" row
    // in proseql) is a deferred follow-up — see plan U2 / Scope Boundaries.
    const gamescopePolicy = normalizeGamescopePolicy(DEFAULT_GAMESCOPE_POLICY)
    const spec: LaunchSpec = composeMoonlightLaunchSpec({
      host,
      ...(inputDevice.path ? { inputDevice: inputDevice.path } : {}),
      gamescope: {
        enabled: gamescopePolicy.enabled === true,
        ...(gamescopePolicy.command !== undefined
          ? { command: gamescopePolicy.command }
          : {}),
        ...(gamescopePolicy.backend !== undefined
          ? { backend: gamescopePolicy.backend }
          : {}),
        ...(gamescopePolicy.exposeWayland !== undefined
          ? { exposeWayland: gamescopePolicy.exposeWayland }
          : {}),
        ...(gamescopePolicy.args !== undefined
          ? { args: gamescopePolicy.args }
          : {}),
      },
    })

    const result = yield* Effect.tryPromise({
      try: () =>
        launchLocalForegroundSession(foregroundSessionHost.owner, {
          id: payload.id,
          spec,
          spawn: async () => {
            if (!launcher.spawn) return unsupportedManagedSpawn()
            return await Effect.runPromise(
              launcher.spawn(spec).pipe(Effect.mapError(toDataError)),
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
  // remote peer is unreachable / token-rejected; other failure kinds tag
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
      hostUnavailableReason: { kind: "token-rejected" },
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
