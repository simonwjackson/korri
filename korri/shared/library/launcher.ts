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

import { Schema } from "effect"

/**
 * What to launch.
 *
 * - `command`: absolute path to the executable. Must be non-empty.
 * - `args`: argv array. May be empty.
 * - `env`: extra environment variables (merged onto the parent's `env`).
 * - `cwd`: working directory for the child.
 */
export const LaunchSpec = Schema.Struct({
  command: Schema.String.pipe(
    Schema.filter(s => s.length > 0, {
      message: () => "LaunchSpec.command must be non-empty",
    }),
  ),
  args: Schema.Array(Schema.String),
  env: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
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
export type LaunchResult =
  | { readonly status: "launched" }
  | {
      readonly status: "failed"
      readonly exitCode: number
      readonly stderrTail?: string
    }

/**
 * The launcher contract. Implementations spawn or otherwise execute the
 * `LaunchSpec` and resolve when the launch attempt has a definite outcome
 * (process exited, or could not be spawned).
 */
export interface Launcher {
  run(spec: LaunchSpec): Promise<LaunchResult>
}
