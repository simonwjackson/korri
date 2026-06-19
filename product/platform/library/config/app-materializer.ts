import { randomUUID } from "node:crypto"
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { korriCachePath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import { Effect } from "effect"
import type { AppDescriptor } from "./app-integrations"
import {
  AppMaterializationFailed,
  PatchUnsupportedForApp,
  type ResolutionError,
} from "./errors"
import type { LaunchSettings, LaunchSettingValue } from "./launch-block"
import type { LauncherRecord } from "./records/launcher"
import type {
  ReadableResolvedLaunchContext,
  ResolvedLaunchContext,
} from "./resolved-launch-context"

const LAUNCH_ARTIFACTS_DIR_ENV = "KORRI_LAUNCH_ARTIFACTS_DIR" as const
const MATERIALIZER_PLACEHOLDER_PATTERN =
  /\{(?:configPath|configDir|userDir|modulePath)\}/
export const STALE_ARTIFACT_RETENTION_MS = 24 * 60 * 60 * 1000

export type MaterializedLaunchArtifacts = LaunchArtifacts

export interface MaterializedAppLaunch {
  readonly launcher: LauncherRecord
  readonly context: ResolvedLaunchContext
  readonly artifacts?: MaterializedLaunchArtifacts
}

export interface MaterializedReadableLaunch {
  readonly spec: LaunchSpec
  readonly context: ReadableResolvedLaunchContext
  readonly artifacts?: MaterializedLaunchArtifacts
  readonly diagnostics?: readonly string[]
}

export const materializeAppLaunch = (input: {
  readonly app: AppDescriptor
  readonly context: ResolvedLaunchContext
  readonly artifactsRoot?: string
  readonly now?: Date
  readonly env?: XdgPathEnv
}): Effect.Effect<MaterializedAppLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const hasPatches = hasResolvedPatches(input.context)
    yield* validatePatchSupport(input.app, hasPatches)

    if (canBypassMaterialization(input.app, hasPatches)) {
      return {
        launcher: appLauncherRecord(input.app),
        context: input.context,
      }
    }

    const root = yield* prepareArtifactRoot(input, hasPatches)
    const artifactRoot = yield* createArtifactRoot(input, root)
    return yield* materializeWithPartialCleanup(input, artifactRoot)
  })

const hasResolvedPatches = (context: ResolvedLaunchContext): boolean =>
  (context.patches?.length ?? 0) > 0

export const validatePatchSupport = (
  app: AppDescriptor,
  hasPatches: boolean,
): Effect.Effect<void, ResolutionError> =>
  hasPatches
    ? Effect.fail(
        new PatchUnsupportedForApp({
          appId: app.id,
          integration: app.integration,
        }),
      )
    : Effect.void

const isProviderQualifiedIntegration = (integration: string): boolean =>
  integration.startsWith("@")

const canBypassMaterialization = (
  app: AppDescriptor,
  hasPatches: boolean,
): boolean =>
  !hasPatches &&
  !isProviderQualifiedIntegration(app.integration) &&
  (app.integration === "generic-process" ||
    (app.integration !== "solarus" && !requiresMaterialization(app)))

const prepareArtifactRoot = (
  input: Parameters<typeof materializeAppLaunch>[0],
  hasPatches: boolean,
): Effect.Effect<string, ResolutionError> =>
  Effect.gen(function* () {
    const root = yield* resolveArtifactsRoot(input, hasPatches)
    yield* evictStaleArtifacts(root, input.now ?? new Date())
    return root
  })

const createArtifactRoot = (
  input: Parameters<typeof materializeAppLaunch>[0],
  root: string,
): Effect.Effect<string, ResolutionError> => {
  const artifactRoot = join(
    root,
    `${artifactSafeGameId(input.context.gameId)}-${randomUUID()}`,
  )
  return tryMaterialize(input.app.id, async () => {
    await mkdir(artifactRoot, { recursive: true, mode: 0o750 })
    return artifactRoot
  })
}

const materializeWithPartialCleanup = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppLaunch, ResolutionError> =>
  materializeInsideArtifactRoot(input, artifactRoot).pipe(
    Effect.matchEffect({
      onSuccess: result => Effect.succeed(result),
      onFailure: error =>
        removePartialArtifacts(artifactRoot).pipe(
          Effect.flatMap(() => Effect.fail(error)),
        ),
    }),
  )

const materializeInsideArtifactRoot = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const resources = yield* materializeAppResources(input, artifactRoot)
    return {
      launcher: appLauncherRecord(input.app),
      context: {
        ...input.context,
        ...resources.contextExtras,
        ...(resources.env ? { env: resources.env } : {}),
      },
      artifacts: { root: artifactRoot, paths: resources.paths },
    }
  })

interface MaterializedAppResources {
  readonly paths: Readonly<Record<string, string>>
  readonly contextExtras: ContextExtras
  readonly env?: Readonly<Record<string, string>>
}

type ContextExtras = {
  configPath?: string
  modulePath?: string
  configDir?: string
  userDir?: string
  contentPath?: string
}

const materializeAppResources = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppResources, ResolutionError> => {
  switch (input.app.integration) {
    case "mame":
      return materializeMameResources(input, artifactRoot)
    case "dolphin":
      return materializeDolphinResources(input, artifactRoot)
    case "solarus":
      return materializeSolarusResources(input, artifactRoot)
    case "generic-process":
      return Effect.succeed({ paths: {}, contextExtras: {} })
    default:
      return isProviderQualifiedIntegration(input.app.integration)
        ? Effect.fail(
            new AppMaterializationFailed({
              appId: input.app.id,
              reason: `no launch integration registered for provider-qualified app kind ${input.app.integration}`,
            }),
          )
        : Effect.succeed({ paths: {}, contextExtras: {} })
  }
}

const materializeMameResources = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppResources, ResolutionError> =>
  Effect.gen(function* () {
    const configDir = join(artifactRoot, "mame")
    yield* tryMaterialize(input.app.id, async () => {
      await mkdir(configDir, { recursive: true, mode: 0o750 })
    })
    const configPath = join(configDir, "mame.ini")
    yield* writeAtomic(
      input.app.id,
      configPath,
      iniConfig(input.context.settings),
    )
    return {
      paths: { configDir, configPath },
      contextExtras: { configDir },
    }
  })

const materializeDolphinResources = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppResources, ResolutionError> =>
  Effect.gen(function* () {
    const userDir = join(artifactRoot, "dolphin-user")
    const configDir = join(userDir, "Config")
    yield* tryMaterialize(input.app.id, async () => {
      await mkdir(configDir, { recursive: true, mode: 0o750 })
    })
    const configPath = join(configDir, "Dolphin.ini")
    yield* writeAtomic(
      input.app.id,
      configPath,
      iniConfig(input.context.settings),
    )
    return {
      paths: { userDir, configPath },
      contextExtras: { userDir },
    }
  })

const materializeSolarusResources = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppResources, ResolutionError> =>
  Effect.gen(function* () {
    const stateDir = join(artifactRoot, "solarus-state")
    yield* tryMaterialize(input.app.id, async () => {
      await mkdir(stateDir, { recursive: true, mode: 0o750 })
    })
    return {
      paths: { stateDir },
      contextExtras: {},
      env: { ...(input.context.env ?? {}), XDG_STATE_HOME: stateDir },
    }
  })

const resolveArtifactsRoot = (
  input: {
    readonly app: Pick<AppDescriptor, "id">
    readonly artifactsRoot?: string
    readonly env?: XdgPathEnv
  },
  hasPatches: boolean,
): Effect.Effect<string, ResolutionError> => {
  const explicitRoot =
    input.artifactsRoot ??
    input.env?.[LAUNCH_ARTIFACTS_DIR_ENV] ??
    process.env[LAUNCH_ARTIFACTS_DIR_ENV]
  if (explicitRoot) return Effect.succeed(explicitRoot)
  if (!hasPatches) {
    return Effect.fail(
      new AppMaterializationFailed({
        appId: input.app.id,
        reason: `${LAUNCH_ARTIFACTS_DIR_ENV} is required for app config materialization`,
      }),
    )
  }
  return Effect.try({
    try: () => korriCachePath(input.env ?? process.env, "launch-artifacts"),
    catch: error =>
      new AppMaterializationFailed({
        appId: input.app.id,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })
}

const removePartialArtifacts = (root: string): Effect.Effect<void, never> =>
  Effect.promise(async () => {
    await rm(root, { recursive: true, force: true })
  })

export const cleanupLaunchArtifacts = (
  artifacts: MaterializedLaunchArtifacts | undefined,
): Effect.Effect<void, never> =>
  artifacts
    ? Effect.promise(async () => {
        await rm(artifacts.root, { recursive: true, force: true })
      })
    : Effect.void

const requiresMaterialization = (app: AppDescriptor): boolean =>
  [app.command, ...app.args].some(value =>
    MATERIALIZER_PLACEHOLDER_PATTERN.test(value),
  )

const artifactSafeGameId = (gameId: string): string =>
  gameId.replace(/[/\\]/g, "-")

const appLauncherRecord = (app: AppDescriptor): LauncherRecord => ({
  id: app.id,
  command: app.command,
  args: app.args,
  systems: [...app.systems],
  ...(app.policy ? { policy: app.policy } : {}),
})

const writeAtomic = (
  appId: string,
  path: string,
  content: string,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    const tmp = `${path}.${randomUUID()}.tmp`
    await writeFile(tmp, content, { mode: 0o640 })
    await rename(tmp, path)
  })

const tryMaterialize = <A>(
  appId: string,
  run: () => Promise<A>,
): Effect.Effect<A, ResolutionError> =>
  Effect.tryPromise({
    try: run,
    catch: error =>
      new AppMaterializationFailed({
        appId,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const evictStaleArtifacts = (
  root: string,
  now: Date,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize("launch-artifacts", async () => {
    await mkdir(root, { recursive: true, mode: 0o750 })
    const entries = await readdir(root, { withFileTypes: true })
    await Promise.all(
      entries
        .filter(entry => entry.isDirectory())
        .map(async entry => {
          const path = join(root, entry.name)
          const info = await stat(path)
          if (
            now.getTime() - info.mtime.getTime() >
            STALE_ARTIFACT_RETENTION_MS
          ) {
            await rm(path, { recursive: true, force: true })
          }
        }),
    )
  })

const iniConfig = (settings: LaunchSettings | undefined): string =>
  `${Object.entries(settings ?? {})
    .filter((entry): entry is [string, LaunchSettingValue] =>
      isPlainLaunchSettingValue(entry[1]),
    )
    .map(([key, value]) => `${key} = ${serializePlainValue(value)}`)
    .join("\n")}\n`

const isPlainLaunchSettingValue = (
  value: unknown,
): value is LaunchSettingValue =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"

const serializePlainValue = (value: LaunchSettingValue): string => {
  if (typeof value === "boolean") return value ? "1" : "0"
  return String(value)
}
