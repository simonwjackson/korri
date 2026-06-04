import { NotFoundError } from "@platform/api/rpc/errors"
import { CurrentFeatureGates } from "@platform/gates/middleware"
import type { GateName } from "@platform/gates/registry"
import { logger } from "@platform/logger"
import { Effect } from "effect"

export function requireGate(gateName: GateName) {
  return Effect.gen(function* () {
    const { gates } = yield* CurrentFeatureGates
    const gate = gates[gateName]

    if (!gate?.enabled) {
      logger.debug(
        { gate: gateName, reason: gate?.reason },
        "Gate required but off",
      )
      return yield* new NotFoundError({
        message: "Feature not available",
      })
    }

    return gate
  })
}

export function branchOnGate<A, E, R, A2, E2, R2>(
  gateName: GateName,
  options: {
    readonly current: Effect.Effect<A2, E2, R2>
    readonly next: Effect.Effect<A, E, R>
  },
): Effect.Effect<A | A2, E | E2, R | R2 | CurrentFeatureGates> {
  return Effect.gen(function* () {
    const { gates } = yield* CurrentFeatureGates
    const gate = gates[gateName]

    if (gate?.enabled) {
      return yield* options.next
    }

    return yield* options.current
  })
}
