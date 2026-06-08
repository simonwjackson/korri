/**
 * Launcher seam — runs a `LaunchSpec` and reports a structured result.
 *
 * The interface is deliberately minimal: a single `run` method that resolves
 * to a discriminated-union result. Implementations include `ShellLauncher`
 * (real `Bun.spawn`) and any future Korri-OS endpoint.
 *
 * `LaunchSpec` is the structured launch payload. It is *not* a single shell
 * string: shells introduce quoting/escaping bugs and a third-party `<path>`
 * in `gamelist.xml` could inject metacharacters. The launcher passes
 * `[command, ...args]` directly to `Bun.spawn`, so a path containing spaces
 * or shell metacharacters is just data.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 1).
 */

import type { ForegroundManagedSessionHandle } from "@platform/stream/foreground-session-owner"
import { Schema } from "effect"

/**
 * What to launch.
 *
 * - `command`: absolute path to the executable. Must be non-empty.
 * - `args`: argv array. May be empty.
 * - `env`: extra environment variables merged onto the parent's `env`; `null` unsets inherited variables.
 * - `cwd`: working directory for the child.
 */
export const LaunchSpec = Schema.Struct({
  command: Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: "LaunchSpec.command must be non-empty",
      }),
    ),
  ),
  args: Schema.Array(Schema.String),
  env: Schema.optional(
    Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
  ),
  cwd: Schema.optional(Schema.String),
})
export type LaunchSpec = Schema.Schema.Type<typeof LaunchSpec>

export const decodeLaunchSpec = Schema.decodeUnknownSync(LaunchSpec)

/**
 * Outcome of a launch attempt.
 *
 * `launched` means the spawned process exited 0; `failed` means anything else
 * (including ENOENT for the binary itself). `stderrTail` is the last few KB
 * of the child's stderr, present on failure when the launcher captured any.
 */
export const LaunchFailureKind = Schema.Literals([
  "command-failed",
  "host-unavailable",
  "host-control-disabled",
  "no-such-game",
  "prepare-failed",
  "moonlight-failed",
  "input-unavailable",
  "input-ambiguous",
  "session-busy",
])
export type LaunchFailureKind = Schema.Schema.Type<typeof LaunchFailureKind>

export const LAUNCH_FAILURE_EXIT_CODES = {
  "command-failed": 1,
  "host-unavailable": 124,
  "host-control-disabled": 126,
  "no-such-game": 127,
  "prepare-failed": 1,
  "moonlight-failed": 125,
  "input-unavailable": 123,
  "input-ambiguous": 122,
  "session-busy": 121,
} satisfies Record<LaunchFailureKind, number>

export function launchFailureExitCode(kind: LaunchFailureKind): number {
  return LAUNCH_FAILURE_EXIT_CODES[kind]
}

export type LaunchResult =
  | { readonly status: "launched" }
  | {
      readonly status: "failed"
      readonly exitCode: number
      readonly stderrTail?: string
      readonly failureKind?: LaunchFailureKind
    }

export type ManagedLaunchSessionHandle = ForegroundManagedSessionHandle

export type ManagedLaunchResult =
  | {
      readonly status: "started"
      readonly session: ManagedLaunchSessionHandle
      readonly result: Promise<LaunchResult>
    }
  | {
      readonly status: "failed"
      readonly result: Extract<LaunchResult, { readonly status: "failed" }>
    }

/**
 * Phase 4D / Track A. Optional launch metadata describing supervisor-
 * lifecycle requirements beyond the bare command + args:
 *  - `lifecycle: "foreground"` (default): a single child whose exit ends
 *    the launch.
 *  - `lifecycle: "session"`: a launcher process that exits cleanly while
 *    the session continues. When `wait` is set, the supervisor spawns the
 *    wait monitor after the launcher exits and treats *its* exit as the
 *    terminal child-exit. When `wait` is unset, the supervisor anchors
 *    the role-foreground state until an external terminate request.
 *
 * Launchers that do not understand these fields should ignore them; the
 * sessiond `Launcher` impl is currently the only consumer.
 */
export interface LaunchExtras {
  readonly lifecycle?: "foreground" | "session"
  readonly wait?: LaunchSpec
}

/**
 * The launcher contract. Implementations spawn or otherwise execute the
 * `LaunchSpec` and resolve when the launch attempt has a definite outcome
 * (process exited, or could not be spawned).
 */
export interface Launcher {
  run(spec: LaunchSpec): Promise<LaunchResult>
  spawn?: (
    spec: LaunchSpec,
    extras?: LaunchExtras,
  ) => Promise<ManagedLaunchResult>
}
