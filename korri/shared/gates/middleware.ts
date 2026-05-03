import { type Environment, getEnvironment } from "@shared/config/environment"
import { GATES_HEADER, parseGatesHeader } from "@shared/gates/header"
import { GATE_REGISTRY } from "@shared/gates/registry"
import { resolveGates } from "@shared/gates/resolver"
import type { ResolvedGate } from "@shared/gates/types"
import { logger } from "@shared/logger"
import { Context, Effect, Layer } from "effect"
import { RpcMiddleware } from "effect/unstable/rpc"

export interface FeatureGatesInfo {
  readonly gates: Readonly<Record<string, ResolvedGate | undefined>>
  readonly environment: Environment
}

export class CurrentFeatureGates extends Context.Service<
  CurrentFeatureGates,
  FeatureGatesInfo
>()("CurrentFeatureGates") {}

export class FeatureGatesMiddleware extends RpcMiddleware.Service<
  FeatureGatesMiddleware,
  { provides: CurrentFeatureGates }
>()("FeatureGatesMiddleware") {}

export const FeatureGatesMiddlewareLive = Layer.succeed(FeatureGatesMiddleware)(
  (effect, { headers }) => {
    const environment = getEnvironment()
    const requestedGates = parseGatesHeader(
      headers[GATES_HEADER] as string | undefined,
    )

    if (environment === "production" && requestedGates.size > 0) {
      logger.debug(
        "Feature gates header received in production — ignoring all client requests",
      )
      requestedGates.clear()
    }

    return Effect.provideService(effect, CurrentFeatureGates, {
      gates: resolveGates(GATE_REGISTRY, requestedGates, environment),
      environment,
    } satisfies FeatureGatesInfo)
  },
)
