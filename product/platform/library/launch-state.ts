import type { EntrySource } from "@platform/api/rpc/entry-source"
import type {
  LaunchFailureKind,
  LaunchResult,
} from "@platform/library/launcher"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { stateMachine } from "@platform/state/state-machine"
import { Cause, Exit } from "effect"

export type ReleaseChoiceForLaunch =
  | { readonly _tag: "Launchable"; readonly releaseId: string }
  | { readonly _tag: "ReleaseRequired"; readonly releaseIds: readonly string[] }
  | { readonly _tag: "NotLaunchable"; readonly releaseId: string }
  | { readonly _tag: "NoLaunchableRelease" }

export const releaseChoiceForLaunch = (
  playable: Pick<PlayableLibraryEntry, "releases">,
  releaseId?: string,
): ReleaseChoiceForLaunch => {
  if (releaseId !== undefined) {
    const release = playable.releases.find(
      candidate => candidate.id === releaseId,
    )
    return release?.launchable === true
      ? { _tag: "Launchable", releaseId }
      : { _tag: "NotLaunchable", releaseId }
  }

  const launchable = playable.releases.filter(release => release.launchable)
  if (launchable.length === 0) return { _tag: "NoLaunchableRelease" }
  if (launchable.length === 1) {
    const [release] = launchable
    if (release) return { _tag: "Launchable", releaseId: release.id }
  }
  return {
    _tag: "ReleaseRequired",
    releaseIds: launchable.map(release => release.id),
  }
}

/**
 * Renderer launch input. `id` is the global playable id; `releaseId` is
 * optional and required only for multi-launchable playables. The federation
 * source tag is forwarded to bridge-shaped launchers for local/remote routing.
 */
export type LaunchStartInput = PlayableLibraryEntry & {
  readonly releaseId?: string
  readonly source?: EntrySource
}

export type LaunchState =
  | { readonly _tag: "Idle" }
  | {
      readonly _tag: "ReleaseSelectionRequired"
      readonly gameId: string
      readonly releaseIds: readonly string[]
    }
  | {
      readonly _tag: "Unavailable"
      readonly gameId: string
      readonly releaseId?: string
    }
  | { readonly _tag: "Launching"; readonly gameId: string }
  | { readonly _tag: "Launched"; readonly gameId: string }
  | {
      readonly _tag: "Failed"
      readonly gameId: string
      readonly exitCode: number
      readonly stderrTail?: string
      readonly failureKind?: LaunchFailureKind
    }
  | {
      readonly _tag: "Defect"
      readonly gameId: string
      readonly defect: unknown
    }

const machine = stateMachine<LaunchState>([
  "Idle",
  "ReleaseSelectionRequired",
  "Unavailable",
  "Launching",
  "Launched",
  "Failed",
  "Defect",
])

export const LaunchState = {
  tags: machine.tags,
  select: machine.select,

  idle: { _tag: "Idle" } satisfies LaunchState,

  launching: (gameId: string): LaunchState => ({ _tag: "Launching", gameId }),

  releaseSelectionRequired: (
    gameId: string,
    releaseIds: readonly string[],
  ): LaunchState => ({ _tag: "ReleaseSelectionRequired", gameId, releaseIds }),

  unavailable: (gameId: string, releaseId?: string): LaunchState =>
    releaseId === undefined
      ? { _tag: "Unavailable", gameId }
      : { _tag: "Unavailable", gameId, releaseId },

  fromExit: (
    gameId: string,
    exit: Exit.Exit<LaunchResult, unknown>,
  ): LaunchState => {
    if (Exit.isFailure(exit)) {
      return { _tag: "Defect", gameId, defect: Cause.squash(exit.cause) }
    }

    if (exit.value.status === "failed") {
      return exit.value.stderrTail !== undefined
        ? {
            _tag: "Failed",
            gameId,
            exitCode: exit.value.exitCode,
            stderrTail: exit.value.stderrTail,
            ...(exit.value.failureKind
              ? { failureKind: exit.value.failureKind }
              : {}),
          }
        : {
            _tag: "Failed",
            gameId,
            exitCode: exit.value.exitCode,
            ...(exit.value.failureKind
              ? { failureKind: exit.value.failureKind }
              : {}),
          }
    }

    return { _tag: "Launched", gameId }
  },

  isLaunching: (state: LaunchState): boolean => state._tag === "Launching",
}

export interface LaunchController {
  readonly state: LaunchState
  readonly start: (game: LaunchStartInput) => void
  readonly retry: () => void
}
