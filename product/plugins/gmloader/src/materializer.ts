import type { XdgPathEnv } from "@platform/config/xdg-paths"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import { appRecordKind } from "@platform/library/config/records/app"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { MaterializedReadableLaunch } from "@platform/library/config/app-materializer"
import type { ExecutablePluginResource } from "@platform/plugin"
import type {
  PluginExecutableResourceFulfiller,
  PluginExecutableResourceResolver,
} from "@platform/plugin/resources"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { defaultGmloaderInstallRoot } from "./library-source"
import { prepareGmloaderPathLaunch } from "./path-launch"
import { KORRI_GMLOADER_PLUGIN_ID } from "./ids"
import {
  createDefaultGmloaderRuntimeFulfiller,
  createDefaultGmloaderRuntimeResolver,
  defaultGmloaderRuntimeResource,
} from "./runtime-defaults"

export interface GmloaderReadableLaunchIntegrationOptions {
  readonly installRoot?: string
  readonly runtimeResource?: ExecutablePluginResource
  readonly runtimeResolver?: PluginExecutableResourceResolver
  readonly runtimeFulfiller?: PluginExecutableResourceFulfiller
  readonly allowRuntimeFulfill?: boolean
}

export interface MaterializedGmloaderReadableLaunch
  extends MaterializedReadableLaunch {
  readonly paths: Readonly<{
    readonly manifestPath: string
    readonly configPath: string
    readonly gameRoot: string
  }>
}

export const gmloaderReadableLaunchIntegration =
  createGmloaderReadableLaunchIntegration()

export function createGmloaderReadableLaunchIntegration(
  options: GmloaderReadableLaunchIntegrationOptions = {},
): ReadableLaunchIntegration {
  return {
    providerId: KORRI_GMLOADER_PLUGIN_ID,
    kind: KORRI_GMLOADER_PLUGIN_ID,
    integration: "gmloader",
    canResolve: context => canMaterializeGmloaderContext(context),
    materialize: (context, materializeOptions) =>
      materializeReadableGmloaderLaunch({
        context,
        env: materializeOptions?.env,
        ...options,
      }),
  }
}

export function materializeReadableGmloaderLaunch(input: {
  readonly context: ReadableResolvedLaunchContext
  readonly installRoot?: string
  readonly runtimeResource?: ExecutablePluginResource
  readonly runtimeResolver?: PluginExecutableResourceResolver
  readonly runtimeFulfiller?: PluginExecutableResourceFulfiller
  readonly allowRuntimeFulfill?: boolean
  readonly env?: XdgPathEnv
}): Effect.Effect<MaterializedGmloaderReadableLaunch, ResolutionError> {
  return Effect.gen(function* () {
    if (appRecordKind(input.context.app) !== KORRI_GMLOADER_PLUGIN_ID) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: `typed GMLoader materialization requires plugin: ${KORRI_GMLOADER_PLUGIN_ID}`,
        }),
      )
    }
    const sourcePath = sourcePathFromContext(input.context)
    if (!sourcePath) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: "typed GMLoader launches require a source content path",
        }),
      )
    }
    const env = input.env ?? process.env
    const runtimeFulfiller =
      input.runtimeFulfiller ?? createDefaultGmloaderRuntimeFulfiller(env)
    const prepared = yield* prepareGmloaderPathLaunch({
      providerId: KORRI_GMLOADER_PLUGIN_ID,
      sourcePath,
      installRoot: input.installRoot ?? defaultGmloaderInstallRoot(env),
      runtimeResource: input.runtimeResource ?? defaultGmloaderRuntimeResource,
      runtimeResolver:
        input.runtimeResolver ?? createDefaultGmloaderRuntimeResolver(env),
      runtimeFulfiller,
      allowRuntimeFulfill:
        input.allowRuntimeFulfill ?? runtimeFulfiller !== undefined,
    }).pipe(
      Effect.mapError(
        error =>
          new AppMaterializationFailed({
            appId: input.context.app.id,
            reason: error.message,
          }),
      ),
    )

    return {
      spec: prepared.envelope.spec,
      context: input.context,
      diagnostics: prepared.diagnostics,
      paths: {
        manifestPath: prepared.manifest.manifestPath,
        configPath: prepared.manifest.run.configPath,
        gameRoot: prepared.manifest.gameRoot,
      },
    }
  })
}

function canMaterializeGmloaderContext(
  context: ReadableResolvedLaunchContext,
): boolean {
  return (
    appRecordKind(context.app) === KORRI_GMLOADER_PLUGIN_ID &&
    sourcePathFromContext(context) !== undefined
  )
}

function sourcePathFromContext(
  context: ReadableResolvedLaunchContext,
): string | undefined {
  const contentPath = stringValue(context.content?.path)
  if (contentPath) return contentPath
  const policy = readRecord(context.plugin?.[KORRI_GMLOADER_PLUGIN_ID])
  return stringValue(policy.sourcePath) ?? stringValue(policy.path)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}
