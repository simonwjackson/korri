import type { Environment } from "@shared/config/environment"
import { GATE_REGISTRY, type GateName, isKnownGate } from "./registry"
import { resolveGates } from "./resolver"
import type { ResolvedGates } from "./types"

export function buildGateStorageKey(
  environment: Environment,
  userId: string,
): string {
  return `gates:${environment}:${userId}`
}

export function pruneUnknownGates(gateIds: readonly string[]): GateName[] {
  return gateIds.filter(isKnownGate) as GateName[]
}

export function computeEffectiveGates(
  requestedOn: ReadonlySet<string>,
  environment: Environment,
): ResolvedGates<GateName> {
  return resolveGates(GATE_REGISTRY, requestedOn, environment)
}

export function readGateStorage(storageKey: string): readonly string[] {
  // Feature-gate ids are non-sensitive local developer/user preferences.
  // Do not expand this storage seam to credentials, tokens, or private data.
  if (typeof localStorage === "undefined") {
    return []
  }

  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return []
    return pruneUnknownGates(JSON.parse(raw) as string[])
  } catch {
    return []
  }
}

export function writeGateStorage(
  storageKey: string,
  value: readonly string[],
): void {
  if (typeof localStorage === "undefined") {
    return
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(pruneUnknownGates(value)))
  } catch {
    // localStorage full or unavailable — ignore and keep runtime state only.
  }
}
