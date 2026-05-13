import type { LaunchSpec } from "@shared/library/launcher"
import { decodeLaunchSpec } from "@shared/library/launcher"
import type { ProfileBackedLaunchTargetRecord } from "./launch-target"
import type { LauncherProfileRecord } from "./launcher-profile"

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g
const SUPPORTED_PLACEHOLDERS = new Set([
  "contentPath",
  "system",
  "emulator",
  "core",
])

export type LaunchResolutionError =
  | {
      readonly _tag: "MissingRequiredValue"
      readonly key: string
    }
  | {
      readonly _tag: "UnresolvedPlaceholder"
      readonly placeholder: string
    }
  | {
      readonly _tag: "DisallowedCommand"
      readonly command: string
    }
  | {
      readonly _tag: "InvalidLaunchConfig"
      readonly message: string
    }

export type LaunchResolutionResult =
  | { readonly _tag: "Resolved"; readonly spec: LaunchSpec }
  | { readonly _tag: "Failed"; readonly error: LaunchResolutionError }

export function resolveLaunchSpec(
  profile: LauncherProfileRecord,
  target: ProfileBackedLaunchTargetRecord,
): LaunchResolutionResult {
  const context = buildContext(profile, target)

  const commandResult = substitute(profile.command, context)
  if (commandResult._tag === "Failed") return commandResult

  const args: string[] = []
  for (const arg of profile.args) {
    const result = substitute(arg, context)
    if (result._tag === "Failed") return result
    args.push(result.value)
  }
  args.push(...(target.argsAppend ?? []))

  const envResult = mergeEnv(profile, target, context)
  if (envResult._tag === "Failed") return envResult

  const cwdTemplate = target.cwd ?? profile.cwd
  const cwdResult = cwdTemplate ? substitute(cwdTemplate, context) : undefined
  if (cwdResult?._tag === "Failed") return cwdResult

  const command = commandResult.value
  const allowedCommands = profile.policy?.allowedCommands
  if (allowedCommands && !allowedCommands.includes(command)) {
    return {
      _tag: "Failed",
      error: { _tag: "DisallowedCommand", command },
    }
  }

  try {
    const spec = decodeLaunchSpec({
      command,
      args,
      ...(envResult.value ? { env: envResult.value } : {}),
      ...(cwdResult ? { cwd: cwdResult.value } : {}),
    })
    return { _tag: "Resolved", spec }
  } catch (error) {
    return {
      _tag: "Failed",
      error: {
        _tag: "InvalidLaunchConfig",
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

type ResolutionContext = Readonly<Record<string, string | undefined>>

function buildContext(
  profile: LauncherProfileRecord,
  target: ProfileBackedLaunchTargetRecord,
): ResolutionContext {
  return {
    contentPath: target.contentPath ?? profile.defaults?.contentPath,
    system: target.system ?? profile.defaults?.system,
    emulator: target.emulator ?? profile.defaults?.emulator,
    core: target.core ?? profile.defaults?.core,
  }
}

type SubstitutionResult =
  | { readonly _tag: "Resolved"; readonly value: string }
  | { readonly _tag: "Failed"; readonly error: LaunchResolutionError }

function substitute(
  template: string,
  context: ResolutionContext,
): SubstitutionResult {
  let failed: LaunchResolutionError | undefined
  const value = template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    if (!SUPPORTED_PLACEHOLDERS.has(key)) {
      failed = { _tag: "UnresolvedPlaceholder", placeholder: match }
      return match
    }

    const replacement = context[key]
    if (replacement === undefined || replacement === "") {
      failed = { _tag: "MissingRequiredValue", key }
      return match
    }

    return replacement
  })

  if (failed) return { _tag: "Failed", error: failed }

  const unresolved = value.match(PLACEHOLDER_PATTERN)?.[0]
  if (unresolved) {
    return {
      _tag: "Failed",
      error: { _tag: "UnresolvedPlaceholder", placeholder: unresolved },
    }
  }

  return { _tag: "Resolved", value }
}

type EnvMergeResult =
  | {
      readonly _tag: "Resolved"
      readonly value: Record<string, string> | undefined
    }
  | { readonly _tag: "Failed"; readonly error: LaunchResolutionError }

function mergeEnv(
  profile: LauncherProfileRecord,
  target: ProfileBackedLaunchTargetRecord,
  context: ResolutionContext,
): EnvMergeResult {
  const merged = { ...(profile.env ?? {}), ...(target.env ?? {}) }
  const out: Record<string, string> = {}

  for (const [key, template] of Object.entries(merged)) {
    const result = substitute(template, context)
    if (result._tag === "Failed") return result
    out[key] = result.value
  }

  return {
    _tag: "Resolved",
    value: Object.keys(out).length > 0 ? out : undefined,
  }
}
