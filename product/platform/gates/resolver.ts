import type { Environment } from "@platform/config/environment"
import type { GateRegistry, ResolvedGate, ResolvedGates } from "./types"

const TOGGLEABLE_ENVIRONMENTS: ReadonlySet<Environment> = new Set([
  "local",
  "development",
])

export function isToggleableEnvironment(env: Environment): boolean {
  return TOGGLEABLE_ENVIRONMENTS.has(env)
}

export function resolveGates<K extends string>(
  registry: GateRegistry<K>,
  requestedOn: ReadonlySet<string>,
  environment: Environment,
): ResolvedGates<K> {
  const result = {} as Record<K, ResolvedGate>

  for (const name of Object.keys(registry) as K[]) {
    const requested = requestedOn.has(name)

    if (!isToggleableEnvironment(environment)) {
      result[name] = {
        enabled: false,
        requested,
        reason: "production",
      }
      continue
    }

    result[name] = requested
      ? {
          enabled: true,
          requested: true,
          reason: null,
        }
      : {
          enabled: false,
          requested: false,
          reason: "not-requested",
        }
  }

  return result as ResolvedGates<K>
}

export function isGateEnabled<K extends string>(
  registry: GateRegistry<K>,
  requestedOn: ReadonlySet<string>,
  environment: Environment,
  gateName: K,
): boolean {
  const resolved = resolveGates(registry, requestedOn, environment)
  return resolved[gateName]?.enabled ?? false
}
