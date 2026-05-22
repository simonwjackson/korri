/**
 * LibrarySource seam — the renderer's view of "what games are available".
 *
 * Three operations:
 *   - `list()`: every game the source knows about, already sorted in the order
 *     the source considers correct (for ROCKNIX MVP, lastPlayed desc with
 *     undefined last). The renderer does not re-sort.
 *   - `launchSpecFor(id)`: back-compat shape. Returns just the `LaunchSpec`
 *     for a game with all-default cascade inputs (no user, no preset, no
 *     override), or `undefined` if resolution fails. New code should call
 *     `resolveLaunchForGame` instead.
 *   - `resolveLaunchForGame(id, inputs)`: full resolved-launch output —
 *     spec + gamescope policy. The stream prepare RPC consumes this.
 *
 * Runtime composition wraps this plain TS interface in the Effect Service
 * declared in `library-services.ts`, letting RPC handlers and stories share
 * the same layer-swap seam while keeping implementations simple.
 */

import type { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import type { GamescopePolicy } from "@shared/library/config/inheritable-fields"
import type { GameRecord } from "@shared/library/config/records/game"
import type { LaunchSpec } from "./launcher"

export interface ResolveLaunchInputs {
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLaunch {
  readonly spec: LaunchSpec
  readonly gamescope?: GamescopePolicy
}

export interface LibrarySource {
  list(): Promise<readonly GameRecord[]>
  launchSpecFor(id: string): Promise<LaunchSpec | undefined>
  resolveLaunchForGame(
    id: string,
    inputs?: ResolveLaunchInputs,
  ): Promise<ResolvedLaunch>
}
