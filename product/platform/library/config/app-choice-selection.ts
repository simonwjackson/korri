import type {
  LaunchCompanionMap,
  LaunchPolicy,
  MoonlightPolicy,
  PluginPolicyMap,
} from "./inheritable-fields"
import type { AppChoice } from "./records/app-choice"

export type AppChoiceSelectionResult =
  | { readonly _tag: "SelectedAppChoice"; readonly choice: AppChoice }
  | {
      readonly _tag: "AppChoiceNotFound"
      readonly appId: string
      readonly appIds: readonly string[]
    }
  | { readonly _tag: "AmbiguousAppChoice"; readonly appIds: readonly string[] }
  | { readonly _tag: "NoAppChoice" }

const mergeObject = <T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  return { ...base, ...override }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergePolicyValue = (base: unknown, override: unknown): unknown => {
  if (override === undefined) return base
  if (Array.isArray(override)) {
    return [...(Array.isArray(base) ? base : []), ...override]
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    return [
      ...new Set([...Object.keys(base), ...Object.keys(override)]),
    ].reduce<Record<string, unknown>>((merged, key) => {
      const value = mergePolicyValue(base[key], override[key])
      if (value !== undefined) merged[key] = value
      return merged
    }, {})
  }
  return override
}

const mergeLaunchCompanions = (
  base: LaunchCompanionMap | undefined,
  override: LaunchCompanionMap | undefined,
): LaunchCompanionMap | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  const baseRecord = base as Readonly<Record<string, unknown>>
  const overrideRecord = override as Readonly<Record<string, unknown>>
  return [...new Set([...Object.keys(base), ...Object.keys(override)])].reduce<
    Record<string, unknown>
  >((merged, providerId) => {
    const value = mergePolicyValue(
      baseRecord[providerId],
      overrideRecord[providerId],
    )
    if (value !== undefined) merged[providerId] = value
    return merged
  }, {}) as LaunchCompanionMap
}

const mergePluginPolicies = (
  base: PluginPolicyMap | undefined,
  override: PluginPolicyMap | undefined,
): PluginPolicyMap | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  const baseRecord = base as Readonly<Record<string, unknown>>
  const overrideRecord = override as Readonly<Record<string, unknown>>
  return [...new Set([...Object.keys(base), ...Object.keys(override)])].reduce<
    Record<string, unknown>
  >((merged, providerId) => {
    const value = mergePolicyValue(
      baseRecord[providerId],
      overrideRecord[providerId],
    )
    if (value !== undefined) merged[providerId] = value
    return merged
  }, {}) as PluginPolicyMap
}

const mergeLaunchPolicy = (
  base: LaunchPolicy | undefined,
  override: LaunchPolicy | undefined,
): LaunchPolicy | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  const withPolicy = mergeLaunchCompanions(base.with, override.with) ?? {}
  return Object.keys(withPolicy).length > 0
    ? { ...base, ...override, with: withPolicy }
    : { ...base, ...override }
}

const mergeChoice = (base: AppChoice, override: AppChoice): AppChoice => ({
  id: override.id,
  ...(override.inherit !== undefined ? { inherit: override.inherit } : {}),
  ...((override.runtime ?? base.runtime)
    ? { runtime: override.runtime ?? base.runtime }
    : {}),
  ...(mergeLaunchPolicy(base.launch, override.launch) !== undefined
    ? { launch: mergeLaunchPolicy(base.launch, override.launch) }
    : {}),
  ...(mergeObject(base.moonlight, override.moonlight) !== undefined
    ? {
        moonlight: mergeObject(
          base.moonlight,
          override.moonlight,
        ) as MoonlightPolicy,
      }
    : {}),
  ...(mergePluginPolicies(base.plugin, override.plugin) !== undefined
    ? { plugin: mergePluginPolicies(base.plugin, override.plugin) }
    : {}),
  ...(mergeObject(base.env, override.env) !== undefined
    ? { env: mergeObject(base.env, override.env) as Record<string, string> }
    : {}),
  ...((override.cwd ?? base.cwd) ? { cwd: override.cwd ?? base.cwd } : {}),
  ...(base.argsAppend !== undefined || override.argsAppend !== undefined
    ? {
        argsAppend: [
          ...(base.argsAppend ?? []),
          ...(override.argsAppend ?? []),
        ],
      }
    : {}),
  ...(base.patches !== undefined || override.patches !== undefined
    ? { patches: [...(base.patches ?? []), ...(override.patches ?? [])] }
    : {}),
})

export const resolveEffectiveAppChoices = (
  systemApps: readonly AppChoice[] | undefined,
  releaseApps: readonly AppChoice[] | undefined,
): readonly AppChoice[] => {
  const choices = new Map<string, AppChoice>()

  for (const choice of systemApps ?? []) {
    choices.set(choice.id, choice)
  }

  for (const choice of releaseApps ?? []) {
    const inherited = choices.get(choice.id)
    choices.set(
      choice.id,
      inherited === undefined || choice.inherit === false
        ? choice
        : mergeChoice(inherited, choice),
    )
  }

  return [...choices.values()]
}

export const selectAppChoice = (
  choices: readonly AppChoice[],
  appId?: string,
): AppChoiceSelectionResult => {
  const appIds = choices.map(choice => choice.id)
  if (appId !== undefined) {
    const choice = choices.find(candidate => candidate.id === appId)
    return choice === undefined
      ? { _tag: "AppChoiceNotFound", appId, appIds }
      : { _tag: "SelectedAppChoice", choice }
  }

  if (choices.length === 0) return { _tag: "NoAppChoice" }
  if (choices.length > 1) return { _tag: "AmbiguousAppChoice", appIds }
  return { _tag: "SelectedAppChoice", choice: choices[0] as AppChoice }
}
