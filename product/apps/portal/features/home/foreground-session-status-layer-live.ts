import { RpcClientLive } from "@platform/api/rpc/client"
import {
  projectForegroundSessionStatusSnapshot,
  snapshotStateFromSessiondMode,
} from "@platform/library/sessiond-lifecycle-projections"
import type {
  ForegroundSessionGateState,
  ProviderLifecycleGateSummary,
} from "@platform/session/foreground-session-gate-state"
import { foregroundSessionGateStateFromSnapshot } from "@platform/session/foreground-session-gate-state"
import type { ForegroundSessionStatusSnapshot } from "@platform/session/foreground-session-status"
import { ForegroundSessionStatusSource } from "@platform/session/foreground-session-status-source"
import { serverRpcGroup } from "@product/apps/portal/api/server/rpc-group"
import type {
  ProviderLifecycleSummary,
  SessiondLifecycleSummary,
} from "@product/apps/portal/api/server/status.rpc"
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
                  gateStateFromServerStatus(
                    response.sessiond,
                    response.serverId,
                    response.providerLifecycle,
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
export { snapshotStateFromSessiondMode }

export function gateStateFromServerStatus(
  sessiond: SessiondLifecycleSummary | undefined,
  serverId: string,
  providerLifecycle: ProviderLifecycleSummary | undefined,
): ForegroundSessionGateState {
  const gate = foregroundSessionGateStateFromSnapshot(
    snapshotFromServerStatus(sessiond, serverId),
  )
  if (!providerLifecycle) return gate
  return {
    ...gate,
    providerLifecycle: providerLifecycleForGate(providerLifecycle),
  }
}

export function snapshotFromServerStatus(
  sessiond: SessiondLifecycleSummary | undefined,
  serverId: string,
): ForegroundSessionStatusSnapshot {
  // serverId is included via the surrounding env but not part of the
  // snapshot schema; retained as a parameter for future logging hooks.
  void serverId
  return projectForegroundSessionStatusSnapshot({ sessiond })
}

function providerLifecycleForGate(
  summary: ProviderLifecycleSummary,
): ProviderLifecycleGateSummary {
  return {
    providerId: summary.providerId,
    observerHealth: summary.observerHealth,
    lifecycleStatus: summary.lifecycleStatus,
    providerPhase: summary.providerPhase,
    displayMessage: summary.displayMessage,
    nextActionHint: summary.nextActionHint,
    ...(summary.appId ? { appId: summary.appId } : {}),
    ...(summary.launchId ? { launchId: summary.launchId } : {}),
  }
}
