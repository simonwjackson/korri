import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import type { LaunchFailureKind, LaunchSpec } from "@platform/library/launcher"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"

export interface KorriSessiondPreSpawnGateRequest {
  readonly launchId: string
  readonly spec: LaunchSpec
  readonly signal: AbortSignal
  readonly launchMetadata?: LaunchMetadata
  readonly launchCompanions?: LaunchCompanionMap
}

export interface KorriSessiondPreSpawnGateHandle {
  readonly stop: () => Promise<void> | void
}

export interface KorriSessiondPreSpawnGate {
  readonly id: string
  readonly start: (
    request: KorriSessiondPreSpawnGateRequest,
  ) => Promise<KorriSessiondPreSpawnGateHandle | void>
}

export class KorriSessiondPreSpawnFailure extends Error {
  readonly failureKind: LaunchFailureKind

  constructor(message: string, failureKind: LaunchFailureKind) {
    super(message)
    this.name = "KorriSessiondPreSpawnFailure"
    this.failureKind = failureKind
  }
}
