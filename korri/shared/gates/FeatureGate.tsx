import type { ReactNode } from "react"
import { useFeatureGate } from "./FeatureGatesProvider"

interface FeatureGateProps {
  readonly gate: string
  readonly current: ReactNode
  readonly next: ReactNode
}

export function FeatureGate({ gate, current, next }: FeatureGateProps) {
  const { enabled } = useFeatureGate(gate)
  return <>{enabled ? next : current}</>
}
