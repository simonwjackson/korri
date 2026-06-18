import {
  type MaterializedReadableLaunch,
  materializeReadableRetroArchLaunch,
} from "@platform/library/config/app-materializer"
import type { ResolutionError } from "@platform/library/config/errors"
import {
  decodeRetroArchPolicy,
  type RetroArchPolicy,
} from "@platform/library/config/inheritable-fields"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { KORRI_RETROARCH_PLUGIN_ID } from "./plugin"

export const retroarchReadableLaunchIntegration: ReadableLaunchIntegration = {
  kind: KORRI_RETROARCH_PLUGIN_ID,
  integration: "retroarch",
  canResolve: context =>
    canMaterializeRetroArchContext(context) &&
    canDecodeRetroArchPluginPolicy(context),
  materialize: context =>
    Effect.gen(function* () {
      const retroarch = yield* decodeRetroArchPluginPolicy(context)
      return yield* materializeReadableRetroArchLaunch({
        context: {
          ...context,
          ...(retroarch ? { retroarch } : {}),
        },
      })
    }),
}

function canMaterializeRetroArchContext(
  context: ReadableResolvedLaunchContext,
): boolean {
  const hasContentPath =
    context.content?.path !== undefined ||
    context.retroarch?.content?.path !== undefined
  const hasCorePath =
    context.runtime?.path !== undefined ||
    context.retroarch?.core?.path !== undefined
  return hasContentPath && hasCorePath
}

function canDecodeRetroArchPluginPolicy(
  context: ReadableResolvedLaunchContext,
): boolean {
  try {
    readRetroArchPluginPolicy(context)
    return true
  } catch {
    return false
  }
}

function decodeRetroArchPluginPolicy(
  context: ReadableResolvedLaunchContext,
): Effect.Effect<RetroArchPolicy | undefined, ResolutionError> {
  return Effect.try({
    try: () => readRetroArchPluginPolicy(context),
    catch: error => error as ResolutionError,
  })
}

function readRetroArchPluginPolicy(
  context: ReadableResolvedLaunchContext,
): RetroArchPolicy | undefined {
  const payload = context.plugin?.[KORRI_RETROARCH_PLUGIN_ID]
  if (payload === undefined) return context.retroarch
  const policy = decodeRetroArchPolicy(payload)
  return Object.keys(policy).length > 0 ? policy : context.retroarch
}

export type RetroArchReadableMaterialization = MaterializedReadableLaunch
