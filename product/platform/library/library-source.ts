/**
 * LibrarySource seam — the renderer's view of local library content.
 *
 * `listPlayableEntries` is the readable-schema contract: playable ids with
 * ordered release metadata. `list` remains as a temporary display-compat view
 * for UI callers that are realigned in the next slice.
 */

import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import type { GamescopePolicy } from "@platform/library/config/inheritable-fields"
import type { LaunchArtifacts } from "./launch-artifacts"
import type { LaunchSpec } from "./launcher"
import type {
  PlayableLibraryEntry,
  PlayableReleaseEntry,
} from "./playable-library"

export interface ResolveLaunchInputs {
  readonly releaseId?: string
  readonly userId?: string
  readonly profileId?: string
  /** @deprecated use profileId. */
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLaunch {
  readonly spec: LaunchSpec
  readonly gamescope?: GamescopePolicy
  readonly artifacts?: LaunchArtifacts
  readonly playable?: {
    readonly id: string
    readonly itemId: string
    readonly containedId?: string
    readonly title?: string
  }
  readonly release?: PlayableReleaseEntry
}

export interface LibrarySource {
  list(): Promise<readonly ResolvedGameRecord[]>
  listPlayableEntries?(): Promise<readonly PlayableLibraryEntry[]>
  launchSpecFor(id: string, releaseId?: string): Promise<LaunchSpec | undefined>
  canResolveLaunchForGame?(
    id: string,
    inputs?: ResolveLaunchInputs,
  ): Promise<boolean>
  resolveLaunchForGame(
    id: string,
    inputs?: ResolveLaunchInputs,
  ): Promise<ResolvedLaunch>
}
