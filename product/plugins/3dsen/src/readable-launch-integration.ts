import { join } from "node:path"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import { appRecordKind } from "@platform/library/config/records/app"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { LaunchSpec } from "@platform/library/launcher"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import type { LaunchPrepareMap } from "@platform/plugin/launch-prepare"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"
import { Effect } from "effect"
import {
  KORRI_3DSEN_APP_ID,
  KORRI_3DSEN_PLUGIN_ID,
} from "./plugin"
import type { ThreeDSenProfileMapping } from "./rom-registry"

export interface ThreeDSenPluginPolicy {
  readonly executableRoot: string
  readonly registryPath: string
  readonly profileId: string
  readonly profiles: readonly ThreeDSenProfileMapping[]
}

export interface MaterializedReadable3dSenLaunch {
  readonly spec: LaunchSpec
  readonly launchPrepare: LaunchPrepareMap
  readonly launchMetadata: LaunchMetadata
}

export const threeDSenReadableLaunchIntegration: ReadableLaunchIntegration = {
  providerId: KORRI_3DSEN_PLUGIN_ID,
  kind: KORRI_3DSEN_PLUGIN_ID,
  integration: "3dsen",
  canResolve: context => canMaterialize3dSenContext(context),
  materialize: context => materializeReadable3dSenLaunch({ context }),
}

export const materializeReadable3dSenLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
}): Effect.Effect<MaterializedReadable3dSenLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (appRecordKind(input.context.app) !== KORRI_3DSEN_PLUGIN_ID) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: `typed 3dSen materialization requires kind: ${KORRI_3DSEN_PLUGIN_ID}`,
        }),
      )
    }
    const policy = yield* Effect.try({
      try: () => readThreeDSenPluginPolicy(input.context),
      catch: error => error as ResolutionError,
    })
    const command = join(policy.executableRoot, "3dSen.exe")
    const spec: LaunchSpec = {
      command,
      args: [`-id=${policy.profileId}`],
      cwd: policy.executableRoot,
      ...(input.context.env ? { env: input.context.env } : {}),
    }
    return {
      spec,
      launchPrepare: {
        [KORRI_3DSEN_PLUGIN_ID]: {
          registryPath: policy.registryPath,
          selectedProfileId: policy.profileId,
          profiles: policy.profiles,
        },
      },
      launchMetadata: {
        appProviderId: KORRI_3DSEN_PLUGIN_ID,
      },
    }
  })

function canMaterialize3dSenContext(
  context: ReadableResolvedLaunchContext,
): boolean {
  if (appRecordKind(context.app) !== KORRI_3DSEN_PLUGIN_ID) return false
  try {
    readThreeDSenPluginPolicy(context)
    return true
  } catch {
    return false
  }
}

function readThreeDSenPluginPolicy(
  context: ReadableResolvedLaunchContext,
): ThreeDSenPluginPolicy {
  const payload = context.plugin?.[KORRI_3DSEN_PLUGIN_ID]
  if (!isRecord(payload)) {
    throw new AppMaterializationFailed({
      appId: context.app.id,
      reason: `3dSen app choices must configure plugin.${KORRI_3DSEN_PLUGIN_ID}`,
    })
  }
  const profileId = requiredString(payload.profileId, context.app.id, "profileId")
  const executableRoot = requiredString(
    payload.executableRoot,
    context.app.id,
    "executableRoot",
  )
  const registryPath = requiredString(
    payload.registryPath,
    context.app.id,
    "registryPath",
  )
  const profiles = payload.profiles
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new AppMaterializationFailed({
      appId: context.app.id,
      reason: "3dSen plugin policy profiles must be a non-empty array",
    })
  }
  const decodedProfiles = profiles.map((profile, index) =>
    decodeProfile(context.app.id, profile, `profiles[${index}]`),
  )
  if (!decodedProfiles.some(profile => profile.id === profileId)) {
    throw new AppMaterializationFailed({
      appId: context.app.id,
      reason: `3dSen profile ${profileId} is not present in profiles`,
    })
  }
  return { executableRoot, registryPath, profileId, profiles: decodedProfiles }
}

function decodeProfile(
  appId: string,
  input: unknown,
  label: string,
): ThreeDSenProfileMapping {
  if (!isRecord(input)) {
    throw new AppMaterializationFailed({
      appId,
      reason: `3dSen ${label} must be an object`,
    })
  }
  return {
    id: requiredString(input.id, appId, `${label}.id`),
    title: requiredString(input.title, appId, `${label}.title`),
    romPath: requiredString(input.romPath, appId, `${label}.romPath`),
    ...(input.lastTime !== undefined
      ? { lastTime: requiredNumber(input.lastTime, appId, `${label}.lastTime`) }
      : {}),
  }
}

function requiredString(value: unknown, appId: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppMaterializationFailed({
      appId,
      reason: `3dSen plugin policy ${field} must be a non-empty string`,
    })
  }
  return value
}

function requiredNumber(value: unknown, appId: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppMaterializationFailed({
      appId,
      reason: `3dSen plugin policy ${field} must be a finite number`,
    })
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export { KORRI_3DSEN_APP_ID }
