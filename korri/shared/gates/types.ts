export type GateRegistry<K extends string = string> = Record<K, true>

export type GateOffReason = "production" | "not-requested"

export interface ResolvedGate {
  readonly enabled: boolean
  readonly requested: boolean
  readonly reason: GateOffReason | null
}

export type ResolvedGates<K extends string = string> = Readonly<
  Record<K, ResolvedGate>
>
