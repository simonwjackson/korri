/**
 * Status sidecar for the source-machine role.
 *
 * Mirrors the JSON shape `tools/device/game-stream-runner.ts` writes to
 * `KORRI_GAME_STREAM_STATUS_PATH` so existing operator tooling and the
 * `app.server.status` fallback path keep working independently of the
 * Phase 4C runner refactor (U5). Kiosk role does not use this — the
 * existing renderer + electrobun state already covers operator visibility
 * for kiosk hosts.
 *
 * Plan: docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md (U3)
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type {
  GameStreamFailureStage,
  GameStreamState,
} from "./game-stream-state"
import type { KorriSessionMode } from "./sessiond-state"

export interface SessiondLifecycleSnapshot {
  readonly mode: KorriSessionMode
  readonly launchId?: string
  readonly childPid?: number
  readonly exitCode?: number
  readonly failureReason?: string
}

export function translateSessiondToGameStreamState(
  snapshot: SessiondLifecycleSnapshot,
): GameStreamState {
  switch (snapshot.mode) {
    case "stopped":
    case "starting":
    case "home":
      return { mode: "idle" }
    case "launching":
      return {
        mode: "starting",
        ...(snapshot.launchId ? { runId: snapshot.launchId } : {}),
      }
    case "game":
      return {
        mode: "running",
        ...(snapshot.launchId ? { runId: snapshot.launchId } : {}),
        ...(snapshot.childPid !== undefined
          ? { childPid: snapshot.childPid }
          : {}),
      }
    case "restoring":
      return {
        mode: "stopping",
        ...(snapshot.launchId ? { runId: snapshot.launchId } : {}),
      }
    case "recovering":
      return {
        mode: "failed",
        ...(snapshot.launchId ? { runId: snapshot.launchId } : {}),
        ...(snapshot.failureReason
          ? { failureReason: snapshot.failureReason }
          : {}),
        failureStage: "cleanup" satisfies GameStreamFailureStage,
      }
    default: {
      const exhaustive: never = snapshot.mode
      throw new Error(`unhandled sessiond mode: ${String(exhaustive)}`)
    }
  }
}

export interface StatusSidecarLogger {
  warn: (input: unknown, message?: string) => void
}

export interface StatusSidecarOptions {
  /**
   * Filesystem path. Resolved from `KORRI_GAME_STREAM_STATUS_PATH` (or
   * its declarative equivalent) by the production wiring. When undefined
   * the sidecar is a no-op so kiosk hosts pay nothing.
   */
  readonly path: string | undefined
  /**
   * Async writer (path, content) → void. Default writes a real file with
   * mode 0600 inside a directory created at 0700. Tests inject a recorder.
   */
  readonly writer?: (path: string, content: string) => Promise<void>
  readonly logger?: StatusSidecarLogger
}

export interface StatusSidecar {
  readonly write: (snapshot: SessiondLifecycleSnapshot) => Promise<void>
}

const defaultDiskWriter = async (
  path: string,
  content: string,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, content, { mode: 0o600 })
}

export function createStatusSidecar(
  options: StatusSidecarOptions,
): StatusSidecar {
  const writer = options.writer ?? defaultDiskWriter
  return {
    write: async snapshot => {
      if (!options.path) return
      const state = translateSessiondToGameStreamState(snapshot)
      const content = `${JSON.stringify(state, null, 2)}\n`
      try {
        await writer(options.path, content)
      } catch (error) {
        options.logger?.warn(
          { err: error, statusPath: options.path },
          "sessiond-status-sidecar: write failed",
        )
      }
    },
  }
}
