import { composeReadableLaunchSpec } from "@platform/library/config/compose-launch-spec"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import { appRecordKind } from "@platform/library/config/records/app"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { LaunchSpec } from "@platform/library/launcher"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { KORRI_ZQUEST_CLASSIC_PLUGIN_ID } from "./plugin"

export interface MaterializedReadableZQuestClassicLaunch {
  readonly spec: LaunchSpec
}

export const zquestClassicReadableLaunchIntegration: ReadableLaunchIntegration =
  {
    providerId: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
    kind: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
    integration: "zquest-classic",
    canResolve: context =>
      appRecordKind(context.app) === KORRI_ZQUEST_CLASSIC_PLUGIN_ID &&
      context.content?.path !== undefined,
    materialize: context => materializeReadableZQuestClassicLaunch({ context }),
  }

export const materializeReadableZQuestClassicLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
}): Effect.Effect<MaterializedReadableZQuestClassicLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (appRecordKind(input.context.app) !== KORRI_ZQUEST_CLASSIC_PLUGIN_ID) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: `ZQuest Classic materialization requires plugin ${KORRI_ZQUEST_CLASSIC_PLUGIN_ID}`,
        }),
      )
    }
    if (input.context.content?.path === undefined) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: "ZQuest Classic launches require resolved .qst content",
        }),
      )
    }
    const spec = yield* composeReadableLaunchSpec(
      input.context.app,
      input.context,
    ).pipe(
      Effect.mapError(
        error =>
          new AppMaterializationFailed({
            appId: input.context.app.id,
            reason: error instanceof Error ? error.message : String(error),
          }),
      ),
    )
    return { spec }
  })
