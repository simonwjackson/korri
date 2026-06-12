import type {
  GamescopePolicy,
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

const mergeChoice = (base: AppChoice, override: AppChoice): AppChoice => ({
  id: override.id,
  ...(override.inherit !== undefined ? { inherit: override.inherit } : {}),
  ...((override.runtime ?? base.runtime)
    ? { runtime: override.runtime ?? base.runtime }
    : {}),
  ...(mergeObject(base.gamescope, override.gamescope) !== undefined
    ? {
        gamescope: mergeObject(
          base.gamescope,
          override.gamescope,
        ) as GamescopePolicy,
      }
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
  ...(mergeObject(base.extra, override.extra) !== undefined
    ? { extra: mergeObject(base.extra, override.extra) as SteamPolicy["extra"] }
    : {}),
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
