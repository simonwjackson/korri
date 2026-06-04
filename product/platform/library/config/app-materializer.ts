import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  access,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { basename, extname, join } from "node:path"
import {
  korriCachePath,
  korriDataPath,
  korriStatePath,
  type XdgPathEnv,
} from "@platform/config/xdg-paths"
import { Effect } from "effect"
import type { AppDescriptor } from "./app-integrations"
import {
  AppMaterializationFailed,
  PatchFileMissing,
  PatchFileNotRegular,
  PatchFileUnreadable,
  PatchUnsupportedForApp,
  patchExtensionForPath,
  type ResolutionError,
  supportedPatchFormatForPath,
  UnsupportedPatchExtension,
} from "./errors"
import type { LaunchSettings, LaunchSettingValue } from "./launch-block"
import type { LauncherRecord } from "./records/launcher"
import type { ResolvedLaunchContext } from "./resolved-launch-context"

const LAUNCH_ARTIFACTS_DIR_ENV = "KORRI_LAUNCH_ARTIFACTS_DIR" as const
const MATERIALIZER_PLACEHOLDER_PATTERN =
  /\{(?:configPath|configDir|userDir|modulePath)\}/
export const STALE_ARTIFACT_RETENTION_MS = 24 * 60 * 60 * 1000

export interface MaterializedLaunchArtifacts {
  readonly root: string
  readonly paths: Readonly<Record<string, string>>
}

export interface MaterializedAppLaunch {
  readonly launcher: LauncherRecord
  readonly context: ResolvedLaunchContext
  readonly artifacts?: MaterializedLaunchArtifacts
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
    yield* rejectUnsupportedPatchIntegration(input.app, hasPatches)

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

const rejectUnsupportedPatchIntegration = (
  app: AppDescriptor,
  hasPatches: boolean,
): Effect.Effect<void, ResolutionError> =>
  hasPatches && app.integration !== "retroarch"
    ? Effect.fail(
        new PatchUnsupportedForApp({
          appId: app.id,
          integration: app.integration,
        }),
      )
    : Effect.void

const canBypassMaterialization = (
  app: AppDescriptor,
  hasPatches: boolean,
): boolean =>
  !hasPatches &&
  (app.integration === "generic-process" ||
    (app.integration !== "solarus" && !requiresMaterialization(app)))

const prepareArtifactRoot = (
  input: Parameters<typeof materializeAppLaunch>[0],
  hasPatches: boolean,
): Effect.Effect<string, ResolutionError> =>
  Effect.gen(function* () {
    const root = yield* resolveArtifactsRoot(input, hasPatches)
    yield* evictStaleArtifacts(root, input.now ?? new Date())
    if (hasPatches) yield* validatePatchedRetroarchInputs(input.context)
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
    case "retroarch":
      return materializeRetroarchResources(input, artifactRoot)
    case "mame":
      return materializeMameResources(input, artifactRoot)
    case "dolphin":
      return materializeDolphinResources(input, artifactRoot)
    case "solarus":
      return materializeSolarusResources(input, artifactRoot)
    case "generic-process":
      return Effect.succeed({ paths: {}, contextExtras: {} })
  }
}

const materializeRetroarchResources = (
  input: Parameters<typeof materializeAppLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedAppResources, ResolutionError> =>
  Effect.gen(function* () {
    const paths: Record<string, string> = {}
    const contextExtras: ContextExtras = {}
    let settings = input.context.settings
    if (hasResolvedPatches(input.context)) {
      const patched = yield* stageRetroarchPatchLaunch({
        appId: input.app.id,
        artifactRoot,
        context: input.context,
        env: input.env ?? process.env,
      })
      Object.assign(paths, patched.paths)
      contextExtras.contentPath = patched.contentPath
      settings = patched.settings
    }
    const configPath = join(artifactRoot, "retroarch.cfg")
    yield* writeAtomic(input.app.id, configPath, retroarchConfig(settings))
    paths.configPath = configPath
    contextExtras.configPath = configPath
    if (input.context.modulePath)
      contextExtras.modulePath = input.context.modulePath
    return { paths, contextExtras }
  })

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

interface StagedRetroarchPatchLaunch {
  readonly contentPath: string
  readonly paths: Readonly<Record<string, string>>
  readonly settings: LaunchSettings
}

const resolveArtifactsRoot = (
  input: {
    readonly app: AppDescriptor
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

const validatePatchedRetroarchInputs = (
  context: ResolvedLaunchContext,
): Effect.Effect<void, ResolutionError> =>
  Effect.gen(function* () {
    const contentPath = context.contentPath
    if (!contentPath) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: context.appId ?? context.launcherId,
          reason: "patched RetroArch launches require contentPath",
        }),
      )
    }
    yield* validateReadableRegularContent(contentPath)
    if (!contentStem(contentPath)) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: context.appId ?? context.launcherId,
          reason: `patched RetroArch content must have a filename extension: ${contentPath}`,
        }),
      )
    }
    for (const patchPath of context.patches ?? []) {
      yield* validateReadableRegularPatch(patchPath)
    }
  })

const validateReadableRegularContent = (
  path: string,
): Effect.Effect<void, ResolutionError> =>
  Effect.tryPromise({
    try: async () => {
      const info = await stat(path)
      if (!info.isFile())
        throw new Error(`content is not a regular file: ${path}`)
      await access(path, constants.R_OK)
    },
    catch: error =>
      new AppMaterializationFailed({
        appId: "retroarch",
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const validateReadableRegularPatch = (
  path: string,
): Effect.Effect<void, ResolutionError> =>
  Effect.tryPromise({
    try: async () => {
      const extension = patchExtensionForPath(path)
      if (!supportedPatchFormatForPath(path)) {
        throw new UnsupportedPatchExtension({ path, extension })
      }
      let info: Awaited<ReturnType<typeof stat>>
      try {
        info = await stat(path)
      } catch (error) {
        if (isNodeErrorCode(error, "ENOENT"))
          throw new PatchFileMissing({ path })
        throw new PatchFileUnreadable({
          path,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
      if (!info.isFile()) {
        throw new PatchFileNotRegular({ path, fileType: fileTypeLabel(info) })
      }
      try {
        await access(path, constants.R_OK)
      } catch (error) {
        throw new PatchFileUnreadable({
          path,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    },
    catch: error => error as ResolutionError,
  })

const stageRetroarchPatchLaunch = (input: {
  readonly appId: string
  readonly artifactRoot: string
  readonly context: ResolvedLaunchContext
  readonly env: XdgPathEnv
}): Effect.Effect<StagedRetroarchPatchLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const sourceContentPath = input.context.contentPath ?? ""
    const stem = contentStem(sourceContentPath)
    if (!stem) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.appId,
          reason: `patched RetroArch content must have a filename extension: ${sourceContentPath}`,
        }),
      )
    }
    const stagedContentPath = join(
      input.artifactRoot,
      basename(sourceContentPath),
    )
    yield* createSymlink(input.appId, sourceContentPath, stagedContentPath)

    const paths: Record<string, string> = { contentPath: stagedContentPath }
    for (const [index, patchPath] of (input.context.patches ?? []).entries()) {
      const extension = patchExtensionForPath(patchPath)
      if (!extension) {
        return yield* Effect.fail(
          new UnsupportedPatchExtension({ path: patchPath, extension }),
        )
      }
      const sidecarPath = join(
        input.artifactRoot,
        `${stem}${extension}${index === 0 ? "" : index}`,
      )
      yield* createSymlink(input.appId, patchPath, sidecarPath)
      paths[`patch${index}`] = sidecarPath
    }

    const stableSettings = yield* stableRetroarchSettings(
      input.context,
      input.env,
    )
    return {
      contentPath: stagedContentPath,
      paths,
      settings: { ...(input.context.settings ?? {}), ...stableSettings },
    }
  })

const stableRetroarchSettings = (
  context: ResolvedLaunchContext,
  env: XdgPathEnv,
): Effect.Effect<LaunchSettings, ResolutionError> =>
  Effect.tryPromise({
    try: async () => {
      const identity = stableRetroarchIdentity(context)
      const systemSegment = encodeURIComponent(context.system)
      const saveDir = korriDataPath(
        env,
        "retroarch",
        "v1",
        systemSegment,
        identity,
      )
      const stateDir = korriStatePath(
        env,
        "retroarch",
        "v1",
        systemSegment,
        identity,
      )
      await Promise.all([
        mkdir(saveDir, { recursive: true, mode: 0o750 }),
        mkdir(stateDir, { recursive: true, mode: 0o750 }),
      ])
      return {
        savefile_directory: saveDir,
        savestate_directory: stateDir,
      }
    },
    catch: error =>
      new AppMaterializationFailed({
        appId: context.appId ?? context.launcherId,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const stableRetroarchIdentity = (context: ResolvedLaunchContext): string => {
  const declaredContentPath = context.contentPath ?? ""
  const hash = createHash("sha256")
    .update(`${context.system}\0${declaredContentPath}`)
    .digest("hex")
  const basenamePrefix = basename(declaredContentPath).slice(0, 80)
  return `${encodeURIComponent(basenamePrefix)}--${hash}`
}

const contentStem = (path: string): string | undefined => {
  const extension = extname(path)
  if (!extension) return undefined
  return basename(path, extension)
}

const createSymlink = (
  appId: string,
  target: string,
  path: string,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    await symlink(target, path)
  })

const removePartialArtifacts = (root: string): Effect.Effect<void, never> =>
  Effect.promise(async () => {
    await rm(root, { recursive: true, force: true })
  })

const isNodeErrorCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code

const fileTypeLabel = (info: Awaited<ReturnType<typeof stat>>): string => {
  if (info.isDirectory()) return "directory"
  if (info.isSymbolicLink()) return "symlink"
  if (info.isBlockDevice()) return "block device"
  if (info.isCharacterDevice()) return "character device"
  if (info.isFIFO()) return "fifo"
  if (info.isSocket()) return "socket"
  return "unknown"
}

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

const retroarchConfig = (settings: LaunchSettings | undefined): string =>
  `${Object.entries(settings ?? {})
    .map(([key, value]) => `${key} = ${serializeRetroarchValue(value)}`)
    .join("\n")}\n`

const iniConfig = (settings: LaunchSettings | undefined): string =>
  `${Object.entries(settings ?? {})
    .map(([key, value]) => `${key} = ${serializePlainValue(value)}`)
    .join("\n")}\n`

const serializeRetroarchValue = (value: LaunchSettingValue): string => {
  if (typeof value === "boolean") return value ? '"true"' : '"false"'
  if (typeof value === "number") return String(value)
  return JSON.stringify(value)
}

const serializePlainValue = (value: LaunchSettingValue): string => {
  if (typeof value === "boolean") return value ? "1" : "0"
  return String(value)
}
