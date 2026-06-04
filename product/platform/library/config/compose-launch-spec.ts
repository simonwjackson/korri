/**
 * compose-launch-spec - placeholder substitution adapter.
 *
 * Takes a `LauncherRecord` (provides the argv template + optional
 * `policy.allowedCommands`) and a `ResolvedLaunchContext` (provides
 * the values from the cascade) and produces a `LaunchSpec` ready for
 * the runner to consume.
 *
 * Supported placeholders: `{contentPath}`, `{system}`, `{emulator}`,
 * `{core}`, `{modulePath}`, `{configPath}`, `{configDir}`, `{userDir}`.
 * Unknown placeholders fail with `UnresolvedPlaceholder`;
 * a referenced placeholder with no value fails with
 * `MissingRequiredValue`. The `policy.allowedCommands` whitelist is
 * enforced - a command not on the list fails with `DisallowedCommand`.
 *
 * This is *not* where gamescope wrapping happens. The launch intent
 * carries the resolved gamescope policy separately, and the runner
 * applies it around the spec at execution time.
 *
 * Replaces the retired launcher-config substitution logic with Effect
 * error flow and consumes the new resolved-
 * context shape instead of profile + target.
 */

import type { LaunchSpec } from "@platform/library/launcher"
import { Effect } from "effect"
import {
  type CompositionError,
  DisallowedCommand,
  MissingRequiredValue,
  UnresolvedPlaceholder,
} from "./errors"
import type { LauncherRecord } from "./records/launcher"
import type { ResolvedLaunchContext } from "./resolved-launch-context"

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g
const SUPPORTED_PLACEHOLDERS = new Set([
  "contentPath",
  "system",
  "emulator",
  "core",
  "modulePath",
  "configPath",
  "configDir",
  "userDir",
])

type SubstitutionContext = Readonly<Record<string, string | undefined>>

const buildContext = (context: ResolvedLaunchContext): SubstitutionContext => ({
  contentPath: context.contentPath,
  system: context.system,
  emulator: context.emulator,
  core: context.core,
  modulePath: context.modulePath,
  configPath: context.configPath,
  configDir: context.configDir,
  userDir: context.userDir,
})

const substitute = (
  template: string,
  ctx: SubstitutionContext,
): Effect.Effect<string, CompositionError> =>
  Effect.gen(function* () {
    let failure: CompositionError | undefined
    const value = template.replace(
      PLACEHOLDER_PATTERN,
      (match, key: string) => {
        if (!SUPPORTED_PLACEHOLDERS.has(key)) {
          failure = new UnresolvedPlaceholder({ placeholder: match })
          return match
        }
        const replacement = ctx[key]
        if (replacement === undefined || replacement === "") {
          failure = new MissingRequiredValue({ field: key })
          return match
        }
        return replacement
      },
    )
    if (failure) return yield* Effect.fail(failure)
    return value
  })

export const composeLaunchSpec = (
  launcher: LauncherRecord,
  context: ResolvedLaunchContext,
): Effect.Effect<LaunchSpec, CompositionError> =>
  Effect.gen(function* () {
    const subCtx = buildContext(context)

    const command = yield* substitute(launcher.command, subCtx)
    const substitutedArgs: string[] = []
    for (const arg of launcher.args) {
      substitutedArgs.push(yield* substitute(arg, subCtx))
    }
    const args = [...substitutedArgs, ...(context.argsAppend ?? [])]

    const allowedCommands = launcher.policy?.allowedCommands
    if (allowedCommands && !allowedCommands.includes(command)) {
      return yield* Effect.fail(new DisallowedCommand({ command }))
    }

    const spec: LaunchSpec = {
      command,
      args,
      ...(context.env ? { env: context.env } : {}),
      ...(context.cwd !== undefined ? { cwd: context.cwd } : {}),
    }
    return spec
  })
