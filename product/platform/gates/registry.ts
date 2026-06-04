/**
 * Gate Registry — auto-generated from co-located gate.ts files.
 *
 * DO NOT EDIT MANUALLY.
 * Regenerate: just generate-gates
 */

export const GATE_REGISTRY = {} as const satisfies Record<string, true>

export type GateName = keyof typeof GATE_REGISTRY

export const GATE_NAMES: readonly GateName[] = Object.keys(
  GATE_REGISTRY,
) as GateName[]

export function isKnownGate(name: string): name is GateName {
  return name in GATE_REGISTRY
}
