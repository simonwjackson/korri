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
 * The interface is a plain TS interface, not an Effect Service: the brainstorm
 * favored simplicity over premature DI for the personal MVP. RPC handlers
 * compose a source from `getLibraryContext()` and call its async methods
 * directly.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 1).
 */

import type { GameRecord } from "@shared/fixtures/games/game"
import type { LaunchSpec } from "./launcher"

export interface LibrarySource {
  list(): Promise<readonly GameRecord[]>
  launchSpecFor(id: string): Promise<LaunchSpec | undefined>
}
