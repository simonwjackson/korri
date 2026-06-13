import { rpcProtocolHttpLayer } from "@platform/api/rpc/client-layer"
import type { ControlLaunchResult } from "@platform/control/control-results"
import type { KorriControlService } from "@platform/control/korri-control"
import { findPlayableEntry } from "@platform/control/korri-control"
import type { LaunchLibraryResponse } from "@product/apps/portal/api/library/launch.rpc"
import { serverRpcGroup } from "@product/apps/portal/api/server/rpc-group"
import { Cause, Duration, Effect, Exit, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const DEFAULT_RPC_TIMEOUT_MS = 15_000

export interface KorriControlRpcOptions {
  readonly timeoutMs?: number
}

export function createKorriControlRpc(
  baseUrl: string,
  options: KorriControlRpcOptions = {},
): KorriControlService {
  const rpcUrl = korriRpcUrlForBase(baseUrl)
  const layer = rpcProtocolHttpLayer(rpcUrl)
  const timeoutMs = options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS

  const runRpc = <T>(
    effect: Effect.Effect<T, unknown, Scope.Scope | RpcClient.Protocol>,
  ) =>
    Effect.scoped(
      effect.pipe(
        Effect.provide(layer),
        Effect.timeout(Duration.millis(timeoutMs)),
      ) as Effect.Effect<T, unknown, never>,
    )

  const readCatalogEntries = () =>
    runRpc(
      RpcClient.make(serverRpcGroup).pipe(
        Effect.flatMap(client =>
          client["app.catalog.snapshot"]({ scope: "fabric" }),
        ),
        Effect.flatMap(response =>
          response.health.self === "failed"
            ? Effect.fail(
                new Error(
                  response.health.lastFailure ?? "Catalog self read failed",
                ),
              )
            : Effect.succeed(response.entries),
        ),
      ),
    )

  return {
    listGames: () =>
      readCatalogEntries().pipe(
        Effect.match({
          onFailure: error => controlListGamesTransportFailure(error),
          onSuccess: games => ({
            _tag: "GamesListed" as const,
            games,
          }),
        }),
      ),
    findGame: request =>
      readCatalogEntries().pipe(
        Effect.match({
          onFailure: error => controlFindGameTransportFailure(error),
          onSuccess: entries => findPlayableEntry(entries, request),
        }),
      ),
    dryRunLaunch: request =>
      runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.library.launch.dry-run"]({
              id: request.id,
              ...(request.source ? { source: request.source } : {}),
              ...(request.releaseId !== undefined
                ? { releaseId: request.releaseId }
                : {}),
              ...(request.appId !== undefined ? { appId: request.appId } : {}),
              ...(request.userId !== undefined
                ? { userId: request.userId }
                : {}),
              ...(request.profileId !== undefined
                ? { profileId: request.profileId }
                : {}),
              ...(request.override !== undefined
                ? { override: request.override }
                : {}),
            }),
          ),
        ),
      ).pipe(
        Effect.match({
          onFailure: error => controlDryRunTransportFailure(error),
          onSuccess: response => response,
        }),
      ),
    launchGame: request =>
      runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.library.launch"]({
              id: request.id,
              ...(request.source ? { source: request.source } : {}),
              ...(request.releaseId !== undefined
                ? { releaseId: request.releaseId }
                : {}),
              ...(request.appId !== undefined ? { appId: request.appId } : {}),
              ...(request.userId !== undefined
                ? { userId: request.userId }
                : {}),
              ...(request.profileId !== undefined
                ? { profileId: request.profileId }
                : {}),
              ...(request.override !== undefined
                ? { override: request.override }
                : {}),
            }),
          ),
        ),
      ).pipe(
        Effect.match({
          onFailure: error => hostUnavailableLaunch(request.id, error),
          onSuccess: response =>
            controlLaunchResultFromLaunchLibraryResponse(request.id, response),
        }),
      ),
    sessionStatus: () =>
      runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.session.status"]({})),
        ),
      ).pipe(
        Effect.match({
          onFailure: error => ({
            _tag: "HostUnavailable" as const,
            message: errorMessage(error),
          }),
          onSuccess: response => response,
        }),
      ),
    stopSession: request =>
      runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.session.stop"](request)),
        ),
      ).pipe(
        Effect.match({
          onFailure: error => ({
            _tag: "HostUnavailable" as const,
            message: errorMessage(error),
          }),
          onSuccess: response => response,
        }),
      ),
    daemonStatus: () =>
      runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.server.status"]({})),
        ),
      ).pipe(
        Effect.match({
          onFailure: error => ({
            _tag: "DaemonUnavailable" as const,
            message: errorMessage(error),
          }),
          onSuccess: response => ({
            _tag: "DaemonAvailable" as const,
            serverId: response.serverId,
            displayName: response.displayName,
          }),
        }),
      ),
    streamRuntimeSettingsStatus: () =>
      runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.stream-control.state.get"]({})),
        ),
      ).pipe(
        Effect.match({
          onFailure: error => ({
            _tag: "StreamRuntimeSettingsUnavailable" as const,
            message: errorMessage(error),
          }),
          onSuccess: state => ({
            _tag: "StreamRuntimeSettingsAvailable" as const,
            state,
          }),
        }),
      ),
  }
}

export function korriRpcUrlForBase(baseUrl: string): string {
  // Keep this app-owned client in sync with the portable Pi package defaults:
  // bare hostnames use korrid's default port 3001 and the `/api/rpc` path.
  const raw =
    baseUrl.startsWith("http://") || baseUrl.startsWith("https://")
      ? baseUrl
      : `http://${baseUrl}:3001`
  const trimmed = raw.replace(/\/+$/, "")
  return trimmed.endsWith("/api/rpc") ? trimmed : `${trimmed}/api/rpc`
}

export function controlListGamesTransportFailure(error: unknown) {
  return {
    _tag: "ListGamesUnavailable" as const,
    message: errorMessage(error),
  }
}

export function controlFindGameTransportFailure(error: unknown) {
  return {
    _tag: "HostUnavailable" as const,
    message: errorMessage(error),
  }
}

export function controlDryRunTransportFailure(error: unknown) {
  return {
    _tag: "HostUnavailable" as const,
    message: errorMessage(error),
  }
}

export function controlLaunchResultFromLaunchLibraryResponse(
  id: string,
  response: LaunchLibraryResponse,
): ControlLaunchResult {
  if (response.status === "launched") {
    return { _tag: "Launched", selection: { id } }
  }
  if (response._tag === "PreflightRejected") {
    return {
      _tag: "PreflightRejected",
      selection: { id },
      message: response.stderrTail ?? "session preflight rejected",
    }
  }
  if (response._tag === "DaemonRejected") {
    return {
      _tag: "DaemonRejected",
      selection: { id },
      message: response.stderrTail ?? "session daemon rejected launch",
    }
  }
  if (response._tag === "HostUnavailable") {
    return {
      _tag: "HostUnavailable",
      selection: { id },
      message: response.stderrTail ?? "host unavailable",
    }
  }
  return {
    _tag: "LaunchFailed",
    selection: { id },
    exitCode: response.exitCode,
    ...(response.failureKind ? { failureKind: response.failureKind } : {}),
    ...(response.stderrTail ? { stderrTail: response.stderrTail } : {}),
  }
}

function hostUnavailableLaunch(
  id: string,
  error: unknown,
): ControlLaunchResult {
  return {
    _tag: "HostUnavailable",
    selection: { id },
    message: errorMessage(error),
  }
}

function errorMessage(error: unknown): string {
  if (Exit.isExit(error) && Exit.isFailure(error)) {
    return Cause.pretty(error.cause)
  }
  return error instanceof Error ? error.message : String(error)
}
