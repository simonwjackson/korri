import { Effect } from "effect"

import {
  AppNotFound,
  CustomAppMissingCommand,
  IncompatibleModule,
  type ResolutionError,
} from "./errors"
import {
  type LaunchCompanionMap,
  launchCompanionsFromLaunch,
  type MoonlightPolicy,
} from "./inheritable-fields"
import type { LaunchSettings } from "./launch-block"
import { mergeLaunchSettings } from "./launch-block"
import { type AppKind, type AppRecord, appRecordKind } from "./records/app"
import type { LauncherRecord } from "./records/launcher"
import type { ModuleRecord } from "./records/module"

export type AppIntegrationKind =
  | "retroarch"
  | "mame"
  | "dolphin"
  | "solarus"
  | "generic-process"
  | (string & {})
  | "steam"

export interface AppDescriptor {
  readonly id: string
  readonly kind?: AppKind
  readonly integration: AppIntegrationKind
  readonly capabilities?: {
    readonly baselineDefaults?: boolean
  }
  readonly command: string
  readonly args: readonly string[]
  readonly systems: readonly string[]
  readonly policy?: LauncherRecord["policy"]
  readonly settings?: LaunchSettings
  readonly knownSettings?: readonly string[]
  readonly launchCompanions?: LaunchCompanionMap
  readonly moonlight?: MoonlightPolicy
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly presets?: LauncherRecord["presets"]
}

const integrationForKind = (kind: AppKind): AppIntegrationKind => {
  if (kind === "process") return "generic-process"
  if (kind === "generic-process") return "generic-process"
  return kind as AppIntegrationKind
}

const builtInApps: Readonly<Record<string, AppDescriptor>> = {
  mame: {
    id: "mame",
    integration: "mame",
    command: "mame",
    args: ["-noreadconfig", "-inipath", "{configDir}", "{contentPath}"],
    systems: [],
    policy: { allowedCommands: ["mame"] },
    knownSettings: ["joystick", "skip_gameinfo", "video"],
  },
  dolphin: {
    id: "dolphin",
    integration: "dolphin",
    command: "dolphin-emu",
    args: ["--user", "{userDir}", "--batch", "--exec", "{contentPath}"],
    systems: [],
    policy: { allowedCommands: ["dolphin-emu"] },
    knownSettings: ["internal_resolution", "video_backend"],
  },
  solarus: {
    id: "solarus",
    integration: "solarus",
    command: "solarus-run",
    args: ["{contentPath}"],
    systems: [],
    policy: { allowedCommands: ["solarus-run"] },
    knownSettings: ["fullscreen"],
  },
  steam: {
    id: "steam",
    kind: "steam",
    integration: "steam",
    capabilities: { baselineDefaults: true },
    command: "steam",
    args: [],
    systems: [],
  },
}

export const getBuiltInAppDescriptor = (
  appId: string,
): AppDescriptor | undefined => builtInApps[appId]

const isPlainPolicyObject = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergePolicyDefaults = <T>(base: T, override: T): T => {
  if (isPlainPolicyObject(base) && isPlainPolicyObject(override)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      merged[key] =
        key in merged ? mergePolicyDefaults(merged[key], value) : value
    }
    return merged as T
  }
  return override
}

export const mergeAppLaunchCompanions = (
  base: LaunchCompanionMap | undefined,
  override: LaunchCompanionMap | undefined,
): LaunchCompanionMap | undefined => {
  if (override === undefined) return base
  if (base === undefined) return override
  return mergePolicyDefaults(base, override)
}

export const resolveAppDescriptor = (input: {
  readonly appId: string
  readonly apps: ReadonlyMap<string, AppRecord>
  readonly launchers: ReadonlyMap<string, LauncherRecord>
}): Effect.Effect<AppDescriptor, ResolutionError> =>
  Effect.gen(function* () {
    const builtIn = builtInApps[input.appId]
    const appOverride = input.apps.get(input.appId)
    const legacyLauncher = input.launchers.get(input.appId)

    if (builtIn) {
      if (builtIn.id === "steam" && !appOverride && !legacyLauncher) {
        return yield* Effect.fail(new AppNotFound({ appId: input.appId }))
      }
      return mergeDescriptor(builtIn, appOverride, legacyLauncher)
    }

    if (appOverride) {
      if (!appOverride.command) {
        return yield* Effect.fail(
          new CustomAppMissingCommand({ appId: input.appId }),
        )
      }
      return mergeDescriptor(
        {
          id: input.appId,
          kind: appRecordKind(appOverride),
          integration: integrationForKind(appRecordKind(appOverride)),
          command: appOverride.command,
          args: appOverride.args ?? ["{contentPath}"],
          systems: appOverride.systems ?? [],
        },
        appOverride,
        legacyLauncher,
      )
    }

    if (legacyLauncher) {
      return launcherToDescriptor(legacyLauncher)
    }

    return yield* Effect.fail(new AppNotFound({ appId: input.appId }))
  })

const mergeDescriptor = (
  base: AppDescriptor,
  appOverride: AppRecord | undefined,
  legacyLauncher: LauncherRecord | undefined,
): AppDescriptor => {
  const appOverrideCompanions = appOverride
    ? launchCompanionsFromLaunch(appOverride)
    : undefined
  const legacyLauncherCompanions = legacyLauncher
    ? launchCompanionsFromLaunch(legacyLauncher)
    : undefined
  const launchCompanions =
    appOverrideCompanions !== undefined
      ? mergeAppLaunchCompanions(base.launchCompanions, appOverrideCompanions)
      : mergeAppLaunchCompanions(
          base.launchCompanions,
          legacyLauncherCompanions,
        )
  return {
    ...base,
    capabilities: base.capabilities,
    ...(legacyLauncher
      ? {
          command: legacyLauncher.command,
          args: legacyLauncher.args,
          systems: legacyLauncher.systems,
          policy: legacyLauncher.policy,
          presets: legacyLauncher.presets ?? base.presets,
          launchCompanions,
          moonlight: legacyLauncher.moonlight ?? base.moonlight,
          env: legacyLauncher.env ?? base.env,
          cwd: legacyLauncher.cwd ?? base.cwd,
          argsAppend: legacyLauncher.argsAppend ?? base.argsAppend,
        }
      : {}),
    ...(appOverride?.kind ? { kind: appOverride.kind } : {}),
    ...(appOverride
      ? {
          integration: integrationForKind(appRecordKind(appOverride)),
        }
      : {}),
    ...(appOverride?.command ? { command: appOverride.command } : {}),
    ...(appOverride?.args ? { args: appOverride.args } : {}),
    ...(appOverride?.systems ? { systems: appOverride.systems } : {}),
    ...(appOverride?.policy ? { policy: appOverride.policy } : {}),
    ...(appOverride?.presets ? { presets: appOverride.presets } : {}),
    ...(launchCompanions ? { launchCompanions } : {}),
    ...(appOverride?.moonlight ? { moonlight: appOverride.moonlight } : {}),
    ...(appOverride?.env ? { env: appOverride.env } : {}),
    ...(appOverride?.cwd !== undefined ? { cwd: appOverride.cwd } : {}),
    ...(appOverride?.argsAppend ? { argsAppend: appOverride.argsAppend } : {}),
    settings: mergeLaunchSettings(base.settings, appOverride?.settings),
  }
}

const launcherToDescriptor = (launcher: LauncherRecord): AppDescriptor => ({
  id: launcher.id,
  integration: "generic-process",
  command: launcher.command,
  args: launcher.args,
  systems: launcher.systems,
  policy: launcher.policy,
  launchCompanions: launchCompanionsFromLaunch(launcher),
  moonlight: launcher.moonlight,
  env: launcher.env,
  cwd: launcher.cwd,
  argsAppend: launcher.argsAppend,
  presets: launcher.presets,
})

export const unknownSettingDiagnostics = (input: {
  readonly app: AppDescriptor
  readonly settings?: LaunchSettings
}): readonly string[] => {
  if (!input.app.knownSettings || !input.settings) return []
  const known = new Set(input.app.knownSettings)
  return Object.keys(input.settings).filter(key => !known.has(key))
}

export const validateAppModuleCompatibility = (input: {
  readonly app: AppDescriptor
  readonly module: ModuleRecord
}): Effect.Effect<void, ResolutionError> => {
  if (
    input.app.integration === "retroarch" ||
    input.app.integration === "@korri:retroarch"
  ) {
    return input.module.kind === "libretro-core"
      ? Effect.void
      : Effect.fail(
          new IncompatibleModule({
            appId: input.app.id,
            moduleId: input.module.id,
            moduleKind: input.module.kind,
          }),
        )
  }
  return Effect.fail(
    new IncompatibleModule({
      appId: input.app.id,
      moduleId: input.module.id,
      moduleKind: input.module.kind,
    }),
  )
}
