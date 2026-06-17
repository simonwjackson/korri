import type {
  GamescopePolicy,
  LaunchPolicy,
  MoonlightPolicy,
  RetroArchPolicy,
  SteamPolicy,
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

const mergeGamescopeValue = (
  base: unknown,
  override: unknown,
  path: readonly string[] = [],
): unknown => {
  if (override === undefined) return base
  if (Array.isArray(override)) {
    return path.join(".") === "extraArgs"
      ? [...(Array.isArray(base) ? base : []), ...override]
      : override
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    return [
      ...new Set([...Object.keys(base), ...Object.keys(override)]),
    ].reduce<Record<string, unknown>>((merged, key) => {
      const value = mergeGamescopeValue(base[key], override[key], [
        ...path,
        key,
      ])
      if (value !== undefined) merged[key] = value
      return merged
    }, {})
  }
  return override
}

const mergeGamescopePolicy = (
  base: GamescopePolicy | undefined,
  override: GamescopePolicy | undefined,
): GamescopePolicy | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  return mergeGamescopeValue(base, override) as GamescopePolicy
}

const mergeSteamExtra = (
  base: SteamPolicy["extra"] | undefined,
  override: SteamPolicy["extra"] | undefined,
): SteamPolicy["extra"] | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  return {
    ...base,
    ...override,
    ...(base.args !== undefined || override.args !== undefined
      ? { args: [...(base.args ?? []), ...(override.args ?? [])] }
      : {}),
  }
}

const mergeLaunchPolicy = (
  base: LaunchPolicy | undefined,
  override: LaunchPolicy | undefined,
): LaunchPolicy | undefined => {
  if (base === undefined) return override
  if (override === undefined) return base
  const gamescope = mergeGamescopePolicy(
    base.with?.["@korri:gamescope"],
    override.with?.["@korri:gamescope"],
  )
  const withPolicy = {
    ...(base.with ?? {}),
    ...(override.with ?? {}),
    ...(gamescope !== undefined ? { "@korri:gamescope": gamescope } : {}),
  }
  return Object.keys(withPolicy).length > 0
    ? { ...base, ...override, with: withPolicy }
    : { ...base, ...override }
}

const spreadSteamExtra = (
  base: SteamPolicy["extra"] | undefined,
  override: SteamPolicy["extra"] | undefined,
): { readonly extra?: SteamPolicy["extra"] } => {
  const extra = mergeSteamExtra(base, override)
  return extra === undefined ? {} : { extra }
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
  ...(mergeObject(base.retroarch, override.retroarch) !== undefined
    ? {
        retroarch: mergeObject(
          base.retroarch,
          override.retroarch,
        ) as RetroArchPolicy,
      }
    : {}),
  ...spreadSteamExtra(base.extra, override.extra),
  ...((override["launch-options"] ?? base["launch-options"])
    ? { "launch-options": override["launch-options"] ?? base["launch-options"] }
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
