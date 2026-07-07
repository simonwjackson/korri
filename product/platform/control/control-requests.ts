import type { EntrySource } from "@platform/api/rpc/entry-source"
import type { EphemeralOverride } from "@platform/library/config/ephemeral-override"

export type ControlListGamesRequest = Record<string, never>

export interface ControlFindGameRequest {
  readonly query: string
}

export interface ControlLaunchRequest {
  readonly id: string
  readonly source?: EntrySource
  readonly releaseId?: string
  readonly appId?: string
  readonly userId?: string
  readonly profileId?: string
  readonly override?: EphemeralOverride
  readonly streamBoundaryArgs?: readonly string[]
}

export type ControlDryRunLaunchRequest = ControlLaunchRequest

export interface ControlStopSessionRequest {
  readonly force?: boolean
  /** Mutating adapters must set this after an explicit operator action. */
  readonly confirmed?: boolean
}

export type ControlDaemonStatusRequest = Record<string, never>

export type ControlStreamRuntimeSettingsStatusRequest = Record<string, never>
