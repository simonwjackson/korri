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
 * This is *not* where launch companion wrapping happens. The launch intent
 * carries the resolved companion map separately, and provider handlers apply
 * companion behavior around the spec at execution time.
 *
 * Replaces the retired launcher-config substitution logic with Effect
 * error flow and consumes the new resolved-
 * context shape instead of profile + target.
 */

import type { LaunchSpec } from "@platform/library/launcher"
import { Effect } from "effect"
import { applyArgsOverrides } from "./apply-overrides"
import {
  type CompositionError,
  DisallowedCommand,
  MissingRequiredValue,
  UnresolvedPlaceholder,
} from "./errors"
import type { AppRecord } from "./records/app"
import type { LauncherRecord } from "./records/launcher"
import type {
  ReadableResolvedLaunchContext,
  ResolvedLaunchContext,
} from "./resolved-launch-context"

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
  "settings",
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
  settings:
    context.settings === undefined
      ? undefined
      : JSON.stringify(context.settings),
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

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(context.env ?? {})) {
      env[key] = yield* substitute(value, subCtx)
    }

    const spec: LaunchSpec = {
      command,
      args,
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(context.cwd !== undefined ? { cwd: context.cwd } : {}),
    }
    return spec
  })

const READABLE_PLACEHOLDER_PATTERN =
  /\{([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\}/g
const READABLE_PLACEHOLDERS = new Set([
  "target",
  "content.path",
  "runtime.path",
  "app.id",
  "system",
  "playable.id",
  "release.id",
  "source.id",
  "settings",
  "settings.plugin",
])

const readableContext = (
  context: ReadableResolvedLaunchContext,
): SubstitutionContext => ({
  target: context.target,
  "content.path": context.content?.path,
  "runtime.path": context.runtime?.path,
  "app.id": context.app.id,
  system: context.system,
  "playable.id": context.playableId,
  "release.id": context.releaseId,
  settings:
    context.settings === undefined
      ? undefined
      : JSON.stringify(context.settings),
  "settings.plugin":
    context.settings?.plugin === undefined
      ? undefined
      : JSON.stringify(context.settings.plugin),
})

const substituteReadable = (
  template: string,
  ctx: SubstitutionContext,
): Effect.Effect<string, CompositionError> =>
  Effect.gen(function* () {
    let failure: CompositionError | undefined
    const value = template.replace(
      READABLE_PLACEHOLDER_PATTERN,
      (match, key: string) => {
        if (!READABLE_PLACEHOLDERS.has(key)) {
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

export const composeReadableLaunchSpec = (
  app: AppRecord,
  context: ReadableResolvedLaunchContext,
): Effect.Effect<LaunchSpec, CompositionError> =>
  Effect.gen(function* () {
    if (app.command === undefined) {
      return yield* Effect.fail(new MissingRequiredValue({ field: "command" }))
    }
    const subCtx = readableContext(context)
    const command = yield* substituteReadable(app.command, subCtx)
    const substitutedArgs: string[] = []
    for (const arg of app.args ?? []) {
      substitutedArgs.push(yield* substituteReadable(arg, subCtx))
    }
    // Generic (non-plugin) launchers apply overrides.args over the authored
    // argsAppend tail as the routed segment. overrides.config has no native
    // config target here and is intentionally ignored.
    const args = applyArgsOverrides({
      leading: substitutedArgs,
      routed: context.argsAppend ?? [],
      trailing: [],
      ...(context.overrides?.args !== undefined
        ? { overrides: context.overrides.args }
        : {}),
    })

    const allowedCommands = app.policy?.allowedCommands
    if (allowedCommands && !allowedCommands.includes(command)) {
      return yield* Effect.fail(new DisallowedCommand({ command }))
    }

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(context.env ?? app.env ?? {})) {
      env[key] = yield* substituteReadable(value, subCtx)
    }

    return {
      command,
      args,
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(context.cwd !== undefined ? { cwd: context.cwd } : {}),
    }
  })
