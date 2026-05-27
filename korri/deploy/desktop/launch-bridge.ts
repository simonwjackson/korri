/**
 * Renderer→bun launch bridge.
 *
 * The desktop renderer cannot spawn local processes (it lives in a
 * webview) and the launch flow needs two server-side actions in
 * sequence:
 *
 *   1. Tell the connected korri-server to prepare a stream-launch
 *      (writes a launch intent for the host's game-stream-runner
 *      sunshine app).
 *   2. Spawn Moonlight on *this* device pointed at the connected host
 *      so the just-prepared game's stream is visible.
 *
 * Renderer code calls the desktop-local Effect RPC endpoint:
 *
 *   POST /__korri/desktop/rpc  app.desktop.launch { id }
 *
 * The handler factory takes its dependencies (getConnection,
 * prepareGame, launchMoonlight) as injectable arguments so the bun
 * wiring lives in main.ts and the unit tests can substitute
 * deterministic implementations.
 */

import {
  type LocalStreamLaunchPayload,
  type LocalStreamLaunchResponse,
  localStreamLaunchRpcGroup,
} from "@app/stream/local-stream-launch-rpc"
import type {
  MoonlightLaunchOptions,
  MoonlightLaunchResult,
} from "@app/stream/moonlight-launcher"
import type { RemotePrepareResult } from "@app/stream/remote-stream-client"
import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { logger } from "@shared/logger"
import {
  createForegroundSessionOwner,
  type ForegroundManagedSessionHandle,
  type ForegroundSessionOwnerLaunchResult,
  type ForegroundSessionReadinessInput,
  type ForegroundSessionStageResult,
} from "@shared/stream/foreground-session-owner"
import { Effect, Layer, Scope } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import { RpcServer } from "effect/unstable/rpc"
import type { ConnectionServerRecord } from "./connection-state-snapshot"

type LaunchBridgeResponse = LocalStreamLaunchResponse

export type MoonlightInputPreflightResult =
  | { readonly status: "ok" }
  | {
      readonly status: "failed"
      readonly category: "input-unavailable" | "input-ambiguous"
      readonly message: string
    }

export interface MoonlightForegroundRepair {
  readonly snapshotSurfaceIds: () => Promise<ReadonlySet<number>>
  readonly repairSurface: (options: {
    readonly ignoredWindowIds: ReadonlySet<number>
  }) => Promise<{ readonly windowId?: number } | undefined>
  readonly waitForSurfaceAbsence?: (options: {
    readonly ownedWindowIds: ReadonlySet<number>
    readonly ignoredWindowIds: ReadonlySet<number>
    readonly signal: AbortSignal
  }) => Promise<Readonly<Record<string, unknown>> | undefined>
  readonly probeCompositor?: () => Promise<Readonly<Record<string, unknown>>>
}

export interface LaunchBridgeOptions {
  /**
   * Returns the currently-connected server (hostId + controlUrl), or
   * undefined if the connection controller has not reached the
   * `connected` state. The handler reads this on every request so a
   * reconnection or disconnect between renderer launches is reflected
   * without restart.
   *
   * Federation note: when `payload.source` is present, the bridge
   * IGNORES this and routes against `payload.source.controlUrl`
   * directly (per-entry routing). `getConnection` only matters for
   * transition callers that still omit `source` from the payload
   * (U1 schema-additive window). U8 deletes this seam entirely.
   */
  readonly getConnection: () => ConnectionServerRecord | undefined

  /**
   * Optional delegate for local-source launches. When
   * `payload.source.isLocal === true`, the bridge bypasses the
   * prep+Moonlight path and calls this directly — typically wired to
   * the in-process server's `app.library.launch` so sessiond owns the
   * lifecycle. Returning a `LocalStreamLaunchResponse` keeps the wire
   * shape stable for the renderer.
   */
  readonly launchLocal?: (
    payload: LocalStreamLaunchPayload,
  ) => Promise<LocalStreamLaunchResponse>

  /**
   * Optional local input preflight. Appliance builds use this to fail before
   * preparing a remote stream when the normalized InputPlumber controller is
   * unavailable or ambiguous.
   */
  readonly preflightMoonlightInput?: () => Promise<MoonlightInputPreflightResult>

  /**
   * Calls `app.server.stream.prepare` (with the legacy fallback) on the
   * given host. The product-layer `@app/stream/remote-stream-client`
   * exposes this as `RemoteStreamControlClient.prepareGame`; the
   * indirection here lets tests inject a deterministic implementation.
   */
  readonly prepareGame: (
    controlUrl: string,
    gameId: string,
  ) => Promise<RemotePrepareResult>

  /**
   * Spawns Moonlight locally pointed at the given Korri host. The
   * product-layer `@app/stream/moonlight-launcher` exposes this as
   * `launchMoonlight`; the indirection lets tests inject a
   * deterministic implementation.
   */
  readonly resolveMoonlightGamescope?: () => Promise<
    NonNullable<MoonlightLaunchOptions["gamescope"]>
  >

  readonly launchMoonlight: (options: {
    readonly host: string
    readonly gamescope?: MoonlightLaunchOptions["gamescope"]
  }) => Promise<MoonlightLaunchResult>

  /**
   * Optional local compositor repair for the Moonlight foreground surface.
   * Appliance builds wire this to Sway; tests inject a deterministic implementation.
   */
  readonly moonlightForegroundRepair?: MoonlightForegroundRepair

  /**
   * Optional owner supplied by the desktop composition so process shutdown can
   * terminate the active managed session through the same lifecycle owner.
   */
  readonly foregroundSessionOwner?: LaunchBridgeForegroundSessionOwner

  readonly readinessCooldownMs?: number
  readonly readinessProcessTimeoutMs?: number
  readonly readinessPollMs?: number
  readonly sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>

  /**
   * Optional request id seam for tests and diagnostics. Production uses a
   * unique id per launch attempt so repeated launches of the same game can be
   * correlated separately from the game identity.
   */
  readonly createRequestId?: () => string
}

/**
 * Effect RPC handler for the desktop-local renderer→bun launch boundary.
 */
export function createLocalStreamLaunchRpcHandler(
  options: LaunchBridgeOptions,
): (request: Request) => Promise<Response> {
  const scope = Scope.makeUnsafe()
  const foregroundSessionOwner =
    options.foregroundSessionOwner ??
    createLaunchBridgeForegroundSessionOwner(options)
  const HandlersLive = localStreamLaunchRpcGroup.toLayer(
    localStreamLaunchRpcGroup.of({
      "app.desktop.launch": payload =>
        Effect.promise(() =>
          routeAndPerformLocalStreamLaunch(
            options,
            foregroundSessionOwner,
            payload,
          ),
        ),
    }),
  )
  const ServerLive = Layer.mergeAll(HandlersLive, BatchJsonSerializationLive)
  const webHandler = HttpEffect.toWebHandlerLayerWith(ServerLive, {
    toHandler: context =>
      RpcServer.toHttpEffect(localStreamLaunchRpcGroup).pipe(
        Effect.provideContext(context),
        Effect.provideService(Scope.Scope, scope),
      ),
  })

  return request => webHandler.handler(request)
}

export type LaunchBridgeForegroundSessionOwner = ReturnType<
  typeof createLaunchBridgeForegroundSessionOwner
>

interface PreparedLaunchStage {
  readonly id: string
  readonly connection: ConnectionServerRecord
  readonly prepare: Extract<
    RemotePrepareResult,
    { readonly status: "prepared" }
  >
  readonly moonlightGamescope: MoonlightLaunchOptions["gamescope"]
  readonly ignoredForegroundSurfaceIds?: ReadonlySet<number>
}

interface SpawnedLaunchStage {
  readonly prepared: PreparedLaunchStage
  readonly session: ForegroundManagedSessionHandle
  readonly moonlight: Extract<
    MoonlightLaunchResult,
    { readonly status: "started" }
  >
}

export function createLaunchBridgeForegroundSessionOwner(
  options: LaunchBridgeOptions,
) {
  return createForegroundSessionOwner<
    LocalStreamLaunchPayload,
    PreparedLaunchStage,
    SpawnedLaunchStage,
    LaunchBridgeResponse,
    LaunchBridgeResponse
  >({
    requestIdentity: payload => ({
      requestId: (options.createRequestId ?? createLaunchRequestId)(),
      gameId: payload.id,
    }),
    adapter: {
      prepare: payload => prepareLaunchStage(options, payload),
      spawn: prepared => spawnLaunchStage(options, prepared),
      foreground: spawned => foregroundLaunchStage(options, spawned),
      verifyReady: input => verifyReadyLaunchStage(options, input),
      launched: ({ prepared, spawned }) => launchedResponse(prepared, spawned),
    },
  })
}

function createLaunchRequestId(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * Federation-aware entry point. Local-source payloads short-circuit
 * the foreground-session-owner pipeline (which is Moonlight-shaped)
 * and delegate to `options.launchLocal`. Remote-source and
 * source-absent payloads continue through the existing flow.
 */
async function routeAndPerformLocalStreamLaunch(
  options: LaunchBridgeOptions,
  owner: LaunchBridgeForegroundSessionOwner,
  payload: LocalStreamLaunchPayload,
): Promise<LaunchBridgeResponse> {
  if (payload.source?.isLocal) {
    if (options.launchLocal) {
      return await options.launchLocal(payload)
    }
    // v1: bridge cannot launch local-source entries without a
    // delegate. Surface a typed failure so the renderer can degrade.
    // U8 wires `launchLocal` from main.ts; tests provide it when
    // local launches need to succeed end-to-end.
    logger.warn(
      { id: payload.id, hostId: payload.source.hostId },
      "launch-bridge: local-source launch requested but no launchLocal delegate wired",
    )
    return {
      status: "failed",
      category: "host-unavailable",
      message:
        "local-source launch via desktop bridge requires launchLocal delegate (not wired in this build)",
    }
  }
  return await performLocalStreamLaunch(owner, payload)
}

/**
 * Resolve the connection target for a remote launch. Federation
 * routing prefers `payload.source` (per-entry) over the connection
 * controller's record (legacy single-server). Source-absent payloads
 * preserve the U1-transition fallback.
 */
function resolveLaunchConnection(
  options: LaunchBridgeOptions,
  payload: LocalStreamLaunchPayload,
): ConnectionServerRecord | undefined {
  const source = payload.source
  if (source && !source.isLocal) {
    return {
      hostId: source.hostId,
      controlUrl: source.controlUrl,
    }
  }
  return options.getConnection()
}

async function performLocalStreamLaunch(
  owner: LaunchBridgeForegroundSessionOwner,
  payload: LocalStreamLaunchPayload,
): Promise<LaunchBridgeResponse> {
  const result = await owner.launch(payload)
  return launchResponseFromOwnerResult(result)
}

function launchResponseFromOwnerResult(
  result: ForegroundSessionOwnerLaunchResult<
    LaunchBridgeResponse,
    LaunchBridgeResponse
  >,
): LaunchBridgeResponse {
  if (result._tag === "Launched") return result.value
  if (result._tag === "Busy") {
    return {
      status: "failed",
      category: "session-busy",
      message: result.rejection.message,
    }
  }
  return (
    result.failure ?? {
      status: "failed",
      category: "prepare-failed",
      message: result.message,
    }
  )
}

async function prepareLaunchStage(
  options: LaunchBridgeOptions,
  payload: LocalStreamLaunchPayload,
): Promise<
  ForegroundSessionStageResult<PreparedLaunchStage, LaunchBridgeResponse>
> {
  const id = payload.id
  // Federation routing: prefer payload.source over the connection
  // state. Remote-source payloads MUST route against their declared
  // peer, not whatever the connection controller last latched onto.
  // Source-absent payloads (U1 transition) still fall back to the
  // connection record.
  const connection = resolveLaunchConnection(options, payload)
  if (!connection) {
    logger.warn({ id }, "launch-bridge: refused — no connected upstream")
    return failedLaunchStage({
      status: "failed",
      category: "host-unavailable",
      message: "No connected Korri host",
    })
  }

  const inputFailure = await preflightMoonlightInput(options, connection, id)
  if (inputFailure) return failedLaunchStage(inputFailure)

  const moonlightGamescope = await resolveMoonlightGamescope(
    options,
    connection,
    id,
  )
  const prepare = await prepareGameForLaunch(options, connection, id)
  if (prepare.status === "failed") {
    return failedLaunchStage(prepareFailureResponse(prepare, connection, id))
  }

  const ignoredForegroundSurfaceIds = await snapshotForegroundSurfaceIds(
    options,
    connection,
    id,
  )
  return {
    status: "ok",
    value: {
      id,
      connection,
      prepare,
      moonlightGamescope,
      ...(ignoredForegroundSurfaceIds ? { ignoredForegroundSurfaceIds } : {}),
    },
    evidence: { host: connection.hostId, gameId: prepare.gameId },
  }
}

async function spawnLaunchStage(
  options: LaunchBridgeOptions,
  prepared: PreparedLaunchStage,
): Promise<
  ForegroundSessionStageResult<SpawnedLaunchStage, LaunchBridgeResponse>
> {
  const moonlight = await options.launchMoonlight({
    host: moonlightHostForConnection(prepared.connection),
    gamescope: prepared.moonlightGamescope,
  })

  if (moonlight.status === "failed") {
    logger.warn(
      {
        id: prepared.id,
        host: prepared.connection.hostId,
        sessionId: prepared.prepare.sessionId,
        message: moonlight.message,
      },
      "launch-bridge: prepared but moonlight could not start",
    )
    return failedLaunchStage({
      status: "prepared-no-moonlight",
      gameId: prepared.prepare.gameId,
      ...(prepared.prepare.sessionId
        ? { sessionId: prepared.prepare.sessionId }
        : {}),
      message: moonlight.message,
    })
  }

  if (!moonlight.session) {
    return failedLaunchStage({
      status: "prepared-no-moonlight",
      gameId: prepared.prepare.gameId,
      ...(prepared.prepare.sessionId
        ? { sessionId: prepared.prepare.sessionId }
        : {}),
      message: "Moonlight started without a managed session handle",
    })
  }

  return {
    status: "ok",
    value: { prepared, moonlight, session: moonlight.session },
    evidence: {
      command: moonlight.command,
      processId: moonlight.session.processId,
    },
  }
}

async function foregroundLaunchStage(
  options: LaunchBridgeOptions,
  spawned: SpawnedLaunchStage,
) {
  const repair = await repairForegroundSurface(
    options,
    spawned.prepared.connection,
    spawned.prepared.id,
    spawned.prepared.prepare.sessionId,
    spawned.prepared.ignoredForegroundSurfaceIds,
  )
  if (repair?.status === "warning") return repair
  return repair ?? { status: "ok" as const }
}

async function verifyReadyLaunchStage(
  options: LaunchBridgeOptions,
  input: ForegroundSessionReadinessInput<
    LocalStreamLaunchPayload,
    PreparedLaunchStage,
    SpawnedLaunchStage
  >,
): Promise<ForegroundSessionStageResult<Record<string, unknown>>> {
  const processGone = await waitForProcessGone(options, input)
  if (processGone === false) {
    return {
      status: "failed",
      message: "Moonlight process is still running after exit observation",
      evidence: {
        gate: "process",
        processId: input.spawned.session.processId,
      },
    }
  }

  const ownedWindowIds = launchedSurfaceIdsFromActive(input.active)
  let surfaceEvidence: Readonly<Record<string, unknown>> | undefined
  if (ownedWindowIds.size === 0) {
    surfaceEvidence = { gate: "surface", status: "not-tracked" }
  } else if (options.moonlightForegroundRepair) {
    try {
      surfaceEvidence =
        (await options.moonlightForegroundRepair.waitForSurfaceAbsence?.({
          ownedWindowIds,
          ignoredWindowIds:
            input.prepared.ignoredForegroundSurfaceIds ?? new Set(),
          signal: input.signal,
        })) ?? { gate: "surface", status: "not-checked" }
    } catch (error) {
      return {
        status: "failed",
        message: errorMessage(error) ?? "Moonlight foreground surface remained",
        evidence: {
          gate: "surface",
          message:
            errorMessage(error) ?? "Moonlight foreground surface remained",
          ...errorEvidence(error),
        },
      }
    }
  }

  const compositor = await options.moonlightForegroundRepair
    ?.probeCompositor?.()
    .catch(error => ({
      ok: false,
      message: errorMessage(error) ?? "compositor probe failed",
    }))

  const cooldownMs = options.readinessCooldownMs ?? 0
  if (cooldownMs > 0) await (options.sleep ?? sleep)(cooldownMs, input.signal)

  return {
    status: "ok",
    value: {
      process: processGone === undefined ? "probe-unavailable" : "gone",
      ...(surfaceEvidence ? { surface: surfaceEvidence } : {}),
      ...(compositor ? { compositor } : {}),
      cooldownMs,
    },
  }
}

function launchedResponse(
  prepared: PreparedLaunchStage,
  spawned: SpawnedLaunchStage,
): LaunchBridgeResponse {
  logger.info(
    {
      id: prepared.id,
      host: prepared.connection.hostId,
      sessionId: prepared.prepare.sessionId,
      moonlight: spawned.moonlight.command,
    },
    "launch-bridge: launched",
  )
  return {
    status: "launched",
    gameId: prepared.prepare.gameId,
    ...(prepared.prepare.sessionId
      ? { sessionId: prepared.prepare.sessionId }
      : {}),
    moonlightCommand: spawned.moonlight.command,
  }
}

function failedLaunchStage(
  response: LaunchBridgeResponse,
): ForegroundSessionStageResult<never, LaunchBridgeResponse> {
  return {
    status: "failed",
    message:
      response.status === "failed" ||
      response.status === "prepared-no-moonlight"
        ? response.message
        : "launch failed",
    evidence: {
      status: response.status,
      ...(response.status === "failed" ? { category: response.category } : {}),
    },
    failure: response,
  }
}

async function preflightMoonlightInput(
  options: LaunchBridgeOptions,
  connection: ConnectionServerRecord,
  id: string,
): Promise<LaunchBridgeResponse | undefined> {
  const inputPreflight = await options.preflightMoonlightInput?.()
  if (inputPreflight?.status !== "failed") return undefined

  logger.warn(
    { id, host: connection.hostId, category: inputPreflight.category },
    "launch-bridge: refused — local normalized input unavailable",
  )
  return {
    status: "failed",
    category: inputPreflight.category,
    message: inputPreflight.message,
  } satisfies LaunchBridgeResponse
}

function prepareFailureResponse(
  prepare: Extract<RemotePrepareResult, { readonly status: "failed" }>,
  connection: ConnectionServerRecord,
  id: string,
): LaunchBridgeResponse {
  logger.warn(
    {
      id,
      host: connection.hostId,
      category: prepare.category,
      message: prepare.message,
    },
    "launch-bridge: prepare failed",
  )
  return {
    status: "failed",
    category: prepare.category,
    message: prepare.message,
  } satisfies LaunchBridgeResponse
}

async function snapshotForegroundSurfaceIds(
  options: LaunchBridgeOptions,
  connection: ConnectionServerRecord,
  id: string,
): Promise<ReadonlySet<number> | undefined> {
  if (!options.moonlightForegroundRepair) return undefined
  try {
    return await options.moonlightForegroundRepair.snapshotSurfaceIds()
  } catch (error) {
    logger.warn(
      { id, host: connection.hostId, err: error },
      "launch-bridge: skipped Moonlight foreground repair after snapshot failure",
    )
    return undefined
  }
}

async function repairForegroundSurface(
  options: LaunchBridgeOptions,
  connection: ConnectionServerRecord,
  id: string,
  sessionId: string | undefined,
  ignoredWindowIds: ReadonlySet<number> | undefined,
): Promise<
  | { readonly status: "ok"; readonly evidence?: Record<string, unknown> }
  | { readonly status: "warning"; readonly message: string }
  | undefined
> {
  if (!options.moonlightForegroundRepair || !ignoredWindowIds) return undefined
  try {
    const result = await options.moonlightForegroundRepair.repairSurface({
      ignoredWindowIds,
    })
    return result?.windowId === undefined
      ? { status: "ok" }
      : { status: "ok", evidence: { launchedSurfaceIds: [result.windowId] } }
  } catch (error) {
    logger.warn(
      {
        id,
        host: connection.hostId,
        sessionId,
        err: error,
      },
      "launch-bridge: Moonlight started but foreground repair failed",
    )
    return {
      status: "warning",
      message: errorMessage(error) ?? "Moonlight foreground repair failed",
    }
  }
}

async function resolveMoonlightGamescope(
  options: LaunchBridgeOptions,
  connection: ConnectionServerRecord,
  id: string,
): Promise<MoonlightLaunchOptions["gamescope"]> {
  try {
    return await options.resolveMoonlightGamescope?.()
  } catch (error) {
    logger.warn(
      { id, host: connection.hostId, err: error },
      "launch-bridge: local moonlight Gamescope policy resolution failed; using product default",
    )
    return undefined
  }
}

async function prepareGameForLaunch(
  options: LaunchBridgeOptions,
  connection: ConnectionServerRecord,
  id: string,
): Promise<RemotePrepareResult> {
  try {
    return await options.prepareGame(connection.controlUrl, id)
  } catch (error) {
    const message = errorMessage(error) ?? "prepare-stream call failed"
    logger.warn(
      { id, host: connection.hostId, err: error },
      "launch-bridge: prepareGame threw",
    )
    return {
      status: "failed",
      category: "prepare-failed",
      message,
    }
  }
}

function moonlightHostForConnection(
  connection: ConnectionServerRecord,
): string {
  try {
    const hostname =
      new URL(connection.controlUrl).hostname || connection.hostId
    return hostname.replace(/^\[(.*)\]$/, "$1")
  } catch {
    return connection.hostId
  }
}

async function waitForProcessGone(
  options: LaunchBridgeOptions,
  input: ForegroundSessionReadinessInput<
    LocalStreamLaunchPayload,
    PreparedLaunchStage,
    SpawnedLaunchStage
  >,
): Promise<boolean | undefined> {
  if (!input.spawned.session.isGone) return undefined
  const timeoutMs = options.readinessProcessTimeoutMs ?? 1_000
  const pollMs = options.readinessPollMs ?? 50
  const delay = options.sleep ?? sleep
  const deadline = Date.now() + timeoutMs
  while (!input.signal.aborted) {
    if (await input.spawned.session.isGone()) return true
    if (Date.now() >= deadline) return false
    await delay(pollMs, input.signal)
  }
  return true
}

function launchedSurfaceIdsFromActive(input: {
  readonly foregroundEvidence?: readonly Readonly<Record<string, unknown>>[]
}): ReadonlySet<number> {
  const ids = new Set<number>()
  for (const evidence of input.foregroundEvidence ?? []) {
    const value = evidence.launchedSurfaceIds
    if (!Array.isArray(value)) continue
    for (const id of value) {
      if (typeof id === "number") ids.add(id)
    }
  }
  return ids
}

function errorEvidence(error: unknown): Record<string, unknown> {
  if (typeof error !== "object" || error === null) return {}
  const evidence: Record<string, unknown> = {}
  if ("remainingWindowIds" in error) {
    evidence.remainingWindowIds = error.remainingWindowIds
  }
  return evidence
}

function sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (durationMs <= 0 || signal?.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, durationMs)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout)
        resolve()
      },
      { once: true },
    )
  })
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return undefined
}
