import { serverRpcGroup } from "@app/api/server/rpc-group"
import type { SessiondLifecycleSummary } from "@app/api/server/status.rpc"
import { RpcClientLive } from "@shared/api/rpc/client"
import { foregroundSessionGateStateFromSnapshot } from "@shared/stream/foreground-session-gate-state"
import type { ForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"
import { ForegroundSessionStatusSource } from "@shared/stream/foreground-session-status-source"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

/**
 * Renderer-side `ForegroundSessionStatusSource` backed by the canonical
 * `app.server.status` RPC. Polled at ~1 Hz from `library-atoms.ts` via
 * `Atom.withRefresh`. Sessiond is the authoritative lifecycle source; this
 * layer translates `SessiondLifecycleSummary.mode` into the snapshot
 * vocabulary the gate-state machine already consumes.
 *
 * When `app.server.status` returns no `sessiond` field (host is not paired
 * with sessiond), the layer surfaces `IdleReady` \u2014 same effective behavior
 * as the prior hardcoded bridge endpoint.
 *
 * See: docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md
 */
export const ForegroundSessionStatusLayerLive = Layer.effect(
  ForegroundSessionStatusSource,
)(
  RpcClient.make(serverRpcGroup).pipe(
    Effect.map(
      client =>
        ({
          get: () =>
            client["app.server.status"]({}).pipe(
              Effect.matchEager({
                onSuccess: response =>
                  foregroundSessionGateStateFromSnapshot(
                    snapshotFromServerStatus(
                      response.sessiond,
                      response.serverId,
                    ),
                  ),
                onFailure: error =>
                  foregroundSessionGateStateFromSnapshot({
                    _tag: "LoadError",
                    message:
                      error instanceof Error ? error.message : String(error),
                  }),
              }),
            ),
        }) as const,
    ),
  ),
).pipe(Layer.provide(RpcClientLive))

/**
 * Sessiond mode \u2192 owner-vocabulary `state` string. Required for
 * `foregroundSessionGateStateFromSnapshot` (in `foreground-session-gate-state.ts`)
 * to produce meaningful gate `_tag` values without modifying that switch.
 *
 * The mapping is intentionally lossy: sessiond's `stopped`/`starting` map to
 * `IdleReady` because no managed session is active in those modes. The host
 * isn't paired with a launcher yet; the renderer treats this the same as idle.
 *
 * Wire alias: sessiond's `home` (kiosk role) and `idle` (source-machine role)
 * both mean "no foreground session". Both collapse to `IdleReady`.
 */
export function snapshotStateFromSessiondMode(
  mode: SessiondLifecycleSummary["mode"],
): string {
  switch (mode) {
    case "home":
    case "idle":
    case "starting":
    case "stopped":
      return "IdleReady"
    case "launching":
      return "Spawning"
    case "game":
      return "Running"
    case "restoring":
      return "TearingDown"
    case "recovering":
      return "Recovering"
  }
}

export function snapshotFromServerStatus(
  sessiond: SessiondLifecycleSummary | undefined,
  serverId: string,
): ForegroundSessionStatusSnapshot {
  const serverTimestamp = new Date().toISOString()
  if (!sessiond) {
    // Sessiond not configured on this host. Surface as IdleReady so the
    // gate atom resolves to `{ _tag: "Ready" }` \u2014 same behavior as the
    // pre-U4 hardcoded bridge endpoint.
    return {
      schemaVersion: 1,
      serverTimestamp,
      state: "IdleReady",
      recentEvents: [],
    }
  }

  const state = snapshotStateFromSessiondMode(sessiond.mode)
  const active = sessiond.active
    ? {
        // sessiond's launchId is the closest analog to the owner's requestId.
        // The gate-state mapper only needs requestId/gameId to render
        // identity; both are pseudonymized so this is safe.
        requestId: sessiond.active.launchId,
        gameId: sessiond.active.launchId,
      }
    : undefined

  return {
    schemaVersion: 1,
    serverTimestamp,
    state,
    ...(active ? { active } : {}),
    recentEvents: [],
    ...(sessiond.failureReason
      ? {
          lastFailure: {
            stage: "sessiond",
            message: sessiond.failureReason,
          },
        }
      : {}),
    // serverId is included via the surrounding env but not part of the
    // snapshot schema; retained as a parameter for future logging hooks.
    ...(serverId ? {} : {}),
  }
}
