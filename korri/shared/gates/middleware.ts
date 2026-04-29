import { RpcMiddleware } from "@effect/rpc"
import { type Environment, getEnvironment } from "@shared/config/environment"
import { GATES_HEADER, parseGatesHeader } from "@shared/gates/header"
import { GATE_REGISTRY, type GateName } from "@shared/gates/registry"
import { resolveGates } from "@shared/gates/resolver"
import type { ResolvedGates } from "@shared/gates/types"
import { logger } from "@shared/logger"
import { Context, Effect, Layer } from "effect"

export interface FeatureGatesInfo {
  readonly gates: ResolvedGates<GateName>
  readonly environment: Environment
}

export class CurrentFeatureGates extends Context.Tag("CurrentFeatureGates")<
  CurrentFeatureGates,
  FeatureGatesInfo
>() {}

export class FeatureGatesMiddleware extends RpcMiddleware.Tag<FeatureGatesMiddleware>()(
  "FeatureGatesMiddleware",
  { provides: CurrentFeatureGates },
) {}

export const FeatureGatesMiddlewareLive = Layer.succeed(
  FeatureGatesMiddleware,
  ({ headers }) =>
    Effect.sync(() => {
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

      return {
        gates: resolveGates(GATE_REGISTRY, requestedGates, environment),
        environment,
      } satisfies FeatureGatesInfo
    }),
)
