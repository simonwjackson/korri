/**
 * LibrarySource seam — the renderer's view of "what games are available".
 *
 * One source exposes two operations:
 *   - `list()`: every game the source knows about, already sorted in the order
 *     the source considers correct (for ROCKNIX MVP, lastPlayed desc with
 *     undefined last). The renderer does not re-sort.
 *   - `launchSpecFor(id)`: the structured launch payload for a single game,
 *     or `undefined` if the source no longer knows about that id.
 *
 * Two operations on one interface so that the launch RPC can resolve a spec
 * from the same source instance the list came from. That keeps id semantics
 * consistent and prevents the renderer from ever seeing a `LaunchSpec` (a
 * future product surface — e.g., Korri OS — may resolve `launchSpecFor`
 * very differently without changing the renderer).
 *
 * Runtime composition wraps this plain TS interface in the Effect Service
 * declared in `library-services.ts`, letting RPC handlers and stories share
 * the same layer-swap seam while keeping implementations simple.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 1).
 */

import type { GameRecord } from "@shared/fixtures/games/game"
import type { LaunchSpec } from "./launcher"

export interface LibrarySource {
  list(): Promise<readonly GameRecord[]>
  launchSpecFor(id: string): Promise<LaunchSpec | undefined>
}
