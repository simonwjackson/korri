/**
 * Design-tool seam: preview the cinematic home's launch feedback without a real
 * launch. A tiny cross-root singleton (mirrors pico-settings) so a control in
 * the lab's React root can drive the launch state of a Shift surface mounted in
 * a separate root. Inert in production — nothing sets it unless a design tool
 * does, so `useShiftLaunchPreview()` returns null and the real controller wins.
 */
import { LaunchState } from "@platform/library/launch-state"
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

export function useShiftLaunchPreview(): LaunchState | null {
  return useSyncExternalStore(
    subscribe,
    () => preview,
    () => null,
  )
}

const PREVIEW_GAME = "preview"

export interface ShiftLaunchPreviewOption {
  readonly id: string
  readonly label: string
  /** null = clear the override and let the live controller drive the home. */
  readonly state: LaunchState | null
}

/** The catalog the lab's "Launch" selector offers — one entry per scene state. */
export const SHIFT_LAUNCH_PREVIEWS: readonly ShiftLaunchPreviewOption[] = [
  { id: "off", label: "Off (live)", state: null },
  {
    id: "launching",
    label: "Starting…",
    state: LaunchState.launching(PREVIEW_GAME),
  },
  {
    id: "launched",
    label: "Now playing",
    state: { _tag: "Launched", gameId: PREVIEW_GAME },
  },
  {
    id: "failed-busy",
    label: "Failed · busy",
    state: {
      _tag: "Failed",
      gameId: PREVIEW_GAME,
      exitCode: 121,
      failureKind: "session-busy",
    },
  },
  {
    id: "failed-host",
    label: "Failed · host offline",
    state: {
      _tag: "Failed",
      gameId: PREVIEW_GAME,
      exitCode: 124,
      failureKind: "host-unavailable",
    },
  },
  {
    id: "failed-input",
    label: "Failed · no controller",
    state: {
      _tag: "Failed",
      gameId: PREVIEW_GAME,
      exitCode: 123,
      failureKind: "input-unavailable",
    },
  },
  {
    id: "failed-crash",
    label: "Failed · crash",
    state: {
      _tag: "Failed",
      gameId: PREVIEW_GAME,
      exitCode: 1,
      failureKind: "command-failed",
    },
  },
  {
    id: "failed-missing",
    label: "Failed · not found",
    state: {
      _tag: "Failed",
      gameId: PREVIEW_GAME,
      exitCode: 127,
      failureKind: "no-such-game",
    },
  },
  {
    id: "defect",
    label: "Defect",
    state: { _tag: "Defect", gameId: PREVIEW_GAME, defect: "preview" },
  },
  {
    id: "unavailable",
    label: "Unavailable",
    state: { _tag: "Unavailable", gameId: PREVIEW_GAME },
  },
]
