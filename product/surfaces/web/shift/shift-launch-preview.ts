/**
 * Design-tool seam: preview the cinematic home's launch feedback without a real
 * launch. A tiny cross-root singleton (mirrors pico-settings) so a control in
 * the lab's React root can drive the launch state of a Shift surface mounted in
 * a separate root. Inert in production — nothing sets it unless a design tool
 * does, so `useShiftLaunchPreview()` returns null and the real controller wins.
 *
 * `launchStateSamples` is the single source both the lab "Launch" knob and the
 * gallery part read: one representative value per launch case, keyed by every
 * tag, so a new state can't be added without a sample and both views pick it up.
 */
import { LaunchState } from "@platform/library/launch-state"
import {
  stateVariants,
  type StateVariant,
} from "@platform/state/state-variants"
import { useSyncExternalStore } from "react"

let preview: LaunchState | null = null
const subscribers = new Set<() => void>()

function emit(): void {
  for (const notify of subscribers) notify()
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

export function setShiftLaunchPreview(next: LaunchState | null): void {
  preview = next
  emit()
}

/** Non-reactive read of the current launch pin (null when live). Used by design
 * tools to capture the current coordinate; product code consults the hook. */
export function getShiftLaunchPreview(): LaunchState | null {
  return preview
}

export function useShiftLaunchPreview(): LaunchState | null {
  return useSyncExternalStore(
    subscribe,
    () => preview,
    () => null,
  )
}

const PREVIEW_GAME = "preview"

/** One representative LaunchState per case — exhaustive by construction. */
export const launchStateSamples: {
  readonly [Tag in LaunchState["_tag"]]: () => LaunchState
} = {
  Idle: () => LaunchState.idle,
  Launching: () => LaunchState.launching(PREVIEW_GAME),
  Launched: () => ({ _tag: "Launched", gameId: PREVIEW_GAME }),
  ReleaseSelectionRequired: () =>
    LaunchState.releaseSelectionRequired(PREVIEW_GAME, ["steam", "gog"]),
  Unavailable: () => LaunchState.unavailable(PREVIEW_GAME),
  Failed: () => ({
    _tag: "Failed",
    gameId: PREVIEW_GAME,
    exitCode: 121,
    failureKind: "session-busy",
  }),
  Defect: () => ({ _tag: "Defect", gameId: PREVIEW_GAME, defect: "preview" }),
}

/** Every launch state as a labeled variant — the shared list views render. */
export const LAUNCH_STATE_VARIANTS: readonly StateVariant<
  LaunchState["_tag"],
  LaunchState
>[] = stateVariants<LaunchState["_tag"], LaunchState>(
  LaunchState,
  launchStateSamples,
)

/** The tag the knob treats as "no override — let the live controller drive". */
export const LAUNCH_LIVE_TAG: LaunchState["_tag"] = "Idle"
