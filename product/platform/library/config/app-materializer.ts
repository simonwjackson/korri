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
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  composeRetroArchLaunchSpec,
  renderRetroArchConfig,
} from "@platform/stream/retroarch-launch-spec"
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
import type { RetroArchPolicy, SteamPolicy } from "./inheritable-fields"
import type { LaunchSettings, LaunchSettingValue } from "./launch-block"
import { isSteamAppRecord } from "./records/app"
import type { LauncherRecord } from "./records/launcher"
import type {
  ReadableResolvedLaunchContext,
  ResolvedLaunchContext,
} from "./resolved-launch-context"
import {
  materializeSteamDesiredState,
  type SteamLifecycle,
  type SteamStateFileSystem,
  type SteamStateLock,
} from "./steam-state-materializer"

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

export const materializeReadableRetroArchLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly artifactsRoot?: string
  readonly now?: Date
  readonly env?: XdgPathEnv
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const root = yield* resolveArtifactsRoot(
      {
        app: { id: input.context.app.id },
        artifactsRoot: input.artifactsRoot,
        env: input.env,
      },
      true,
    )
    yield* evictStaleArtifacts(root, input.now ?? new Date())
    const artifactRoot = yield* createReadableArtifactRoot(input, root)
    return yield* materializeReadableWithPartialCleanup(input, artifactRoot)
  })

export const materializeReadableSteamLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly fs?: SteamStateFileSystem
  readonly lifecycle?: SteamLifecycle
  readonly lock?: SteamStateLock
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (!isSteamAppRecord(input.context.app)) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: "typed Steam materialization requires kind: steam",
        }),
      )
    }
    const resources = yield* materializeReadableSteamResources(input)
    return {
      spec: resources.spec,
      context: input.context,
      artifacts: { root: resources.stateRoot, paths: resources.paths },
    }
  })

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
  app.integration !== "steam" &&
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

const createReadableArtifactRoot = (
  input: Parameters<typeof materializeReadableRetroArchLaunch>[0],
  root: string,
): Effect.Effect<string, ResolutionError> => {
  const artifactRoot = join(
    root,
    `${artifactSafeGameId(input.context.playableId)}-${randomUUID()}`,
  )
  return tryMaterialize(input.context.app.id, async () => {
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

const materializeReadableWithPartialCleanup = (
  input: Parameters<typeof materializeReadableRetroArchLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  materializeReadableInsideArtifactRoot(input, artifactRoot).pipe(
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

const materializeReadableInsideArtifactRoot = (
  input: Parameters<typeof materializeReadableRetroArchLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const resources = yield* materializeReadableRetroArchResources(
      input,
      artifactRoot,
    )
    return {
      spec: resources.spec,
      context: input.context,
      artifacts: { root: artifactRoot, paths: resources.paths },
    }
  })

interface MaterializedReadableResources {
  readonly paths: Readonly<Record<string, string>>
  readonly spec: LaunchSpec
  readonly diagnostics?: readonly string[]
}

const materializeReadableRetroArchResources = (
  input: Parameters<typeof materializeReadableRetroArchLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedReadableResources, ResolutionError> =>
  Effect.gen(function* () {
    let policy = input.context.retroarch ?? {}
    let contentPath = policy.content?.path ?? input.context.content?.path
    if (contentPath === undefined) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason:
            "typed RetroArch launches require a resolved content path or retroarch.content.path override",
        }),
      )
    }
    const paths: Record<string, string> = {}

    if ((input.context.patches?.length ?? 0) > 0) {
      const patched = yield* stageReadableRetroarchPatchLaunch({
        appId: input.context.app.id,
        artifactRoot,
        context: input.context,
        env: input.env ?? process.env,
        contentPath,
      })
      Object.assign(paths, patched.paths)
      contentPath = patched.contentPath
      policy = mergeStableRetroArchSettings(policy, patched.settings)
    }

    const configPath = join(artifactRoot, "retroarch.cfg")
    yield* writeAtomic(
      input.context.app.id,
      configPath,
      renderRetroArchConfig(policy),
    )
    paths.configPath = configPath
    if (policy.logging?.logFile) {
      yield* tryMaterialize(input.context.app.id, async () => {
        await mkdir(join(artifactRoot, "logs"), {
          recursive: true,
          mode: 0o750,
        })
      })
    }

    const corePath = policy.core?.path ?? input.context.runtime?.path
    const spec = yield* tryMaterialize(input.context.app.id, async () =>
      composeRetroArchLaunchSpec({
        command: input.context.app.command,
        policy,
        facts: { configPath, corePath: corePath ?? "", contentPath },
      }),
    )
    return { paths, spec }
  })

const STORAGE_TOKEN_PATTERN = /\{storage:([^}]+)\}/g

interface MaterializedSteamResources extends MaterializedReadableResources {
  readonly stateRoot: string
}

const materializeReadableSteamResources = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly fs?: SteamStateFileSystem
  readonly lifecycle?: SteamLifecycle
  readonly lock?: SteamStateLock
}): Effect.Effect<MaterializedSteamResources, ResolutionError> =>
  Effect.gen(function* () {
    const rawPolicy = input.context.steam ?? {}
    const storage = input.context.storage ?? {}
    yield* assertSteamStorageTokensAvailable(
      input.context.app.id,
      rawPolicy,
      storage,
    )
    const policy = yield* tryMaterialize(input.context.app.id, async () =>
      resolveSteamPolicyPaths(rawPolicy, storage),
    )
    const stateRoot = policy.state?.root
    if (!stateRoot) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: "typed Steam launches require state.root",
        }),
      )
    }
    const materialized = yield* materializeSteamDesiredState({
      desired: {
        stateRoot,
        command: input.context.app.command,
        target: input.context.target,
        launchOptions: policy["launch-options"],
        runtime: input.context.runtime
          ? {
              id: input.context.runtime.id,
              path: input.context.runtime.path,
              tool: input.context.runtime.tool,
            }
          : undefined,
        extraArgs: policy.extra?.args,
      },
      fs: input.fs,
      lifecycle: input.lifecycle,
      lock: input.lock,
    }).pipe(
      Effect.mapError(
        error =>
          new AppMaterializationFailed({
            appId: input.context.app.id,
            reason: `${error._tag}: ${"reason" in error ? error.reason : "message" in error ? error.message : JSON.stringify(error)}`,
          }),
      ),
    )
    return {
      stateRoot,
      paths: materialized.paths,
      spec: materialized.spec,
    }
  })

type StorageRoots = Readonly<Record<string, { readonly root?: string }>>

const resolveSteamPolicyPaths = (
  policy: SteamPolicy,
  storage: StorageRoots,
): SteamPolicy => ({
  ...policy,
  state: policy.state
    ? {
        ...policy.state,
        root: resolveStorageTokens(policy.state.root, storage),
      }
    : undefined,
  extra: policy.extra
    ? {
        ...policy.extra,
        ...(policy.extra.args
          ? {
              args: policy.extra.args.map(arg =>
                resolveStorageTokens(arg, storage),
              ),
            }
          : {}),
      }
    : undefined,
})

const resolveStorageTokens = (value: string, storage: StorageRoots): string =>
  value.replace(STORAGE_TOKEN_PATTERN, (_match, storageId: string) => {
    const root = storage[storageId]?.root
    if (!root) throw new Error(`unknown storage token: ${storageId}`)
    return root
  })

const storageTokensInValue = (value: unknown): readonly string[] => {
  const tokens = new Set<string>()
  const visit = (entry: unknown) => {
    if (typeof entry === "string") {
      for (const match of entry.matchAll(STORAGE_TOKEN_PATTERN)) {
        if (match[1]) tokens.add(match[1])
      }
    } else if (Array.isArray(entry)) {
      for (const item of entry) visit(item)
    } else if (entry && typeof entry === "object") {
      for (const item of Object.values(entry)) visit(item)
    }
  }
  visit(value)
  return [...tokens]
}

const assertSteamStorageTokensAvailable = (
  appId: string,
  policy: SteamPolicy,
  storage: StorageRoots,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    for (const storageId of storageTokensInValue({
      state: policy.state,
      extra: policy.extra,
    })) {
      const root = storage[storageId]?.root
      if (!root) throw new Error(`storage ${storageId} is not configured`)
      let info: Awaited<ReturnType<typeof stat>>
      try {
        info = await stat(root)
      } catch {
        throw new Error(`storage ${storageId} root is unavailable: ${root}`)
      }
      if (!info.isDirectory()) {
        throw new Error(`storage ${storageId} root is not a directory: ${root}`)
      }
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
    case "steam":
      return Effect.fail(
        new AppMaterializationFailed({
          appId: input.app.id,
          reason: "Steam apps must use readable Steam materialization",
        }),
      )
    default:
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
    yield* validateReadableRegularContent(
      context.appId ?? context.launcherId,
      contentPath,
    )
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
  appId: string,
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
        appId,
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

const stageReadableRetroarchPatchLaunch = (input: {
  readonly appId: string
  readonly artifactRoot: string
  readonly context: ReadableResolvedLaunchContext
  readonly env: XdgPathEnv
  readonly contentPath: string
}): Effect.Effect<StagedRetroarchPatchLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const stem = contentStem(input.contentPath)
    if (!stem) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.appId,
          reason: `patched RetroArch content must have a filename extension: ${input.contentPath}`,
        }),
      )
    }
    yield* validateReadableRegularContent(input.appId, input.contentPath)
    for (const patchPath of input.context.patches ?? []) {
      yield* validateReadableRegularPatch(patchPath)
    }

    const stagedContentPath = join(
      input.artifactRoot,
      basename(input.contentPath),
    )
    yield* createSymlink(input.appId, input.contentPath, stagedContentPath)

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

    const settings = yield* stableRetroarchSettingsForIdentity({
      appId: input.appId,
      system: input.context.system,
      contentPath: input.contentPath,
      env: input.env,
    })
    return { contentPath: stagedContentPath, paths, settings }
  })

const RETROARCH_TYPED_PATH_SETTING_KEYS = {
  systemDirectory: "system_directory",
  savefileDirectory: "savefile_directory",
  savestateDirectory: "savestate_directory",
  screenshotDirectory: "screenshot_directory",
  contentDirectory: "content_directory",
  cacheDirectory: "cache_directory",
  assetsDirectory: "assets_directory",
  thumbnailsDirectory: "thumbnails_directory",
  playlistDirectory: "playlist_directory",
  libretroDirectory: "libretro_directory",
  libretroInfoPath: "libretro_info_path",
  coreAssetsDirectory: "core_assets_directory",
  coreOptionsPath: "core_options_path",
  joypadAutoconfigDirectory: "joypad_autoconfig_dir",
  inputRemappingDirectory: "input_remapping_directory",
  overlayDirectory: "overlay_directory",
  videoShaderDirectory: "video_shader_dir",
  cheatDatabasePath: "cheat_database_path",
  contentDatabasePath: "content_database_path",
  recordingOutputDirectory: "recording_output_directory",
} as const satisfies Partial<
  Record<keyof NonNullable<RetroArchPolicy["paths"]>, string>
>

const mergeStableRetroArchSettings = (
  policy: RetroArchPolicy,
  settings: LaunchSettings,
): RetroArchPolicy => {
  const stableSettings = { ...settings }
  for (const [field, settingKey] of Object.entries(
    RETROARCH_TYPED_PATH_SETTING_KEYS,
  )) {
    const pathField = field as keyof NonNullable<RetroArchPolicy["paths"]>
    if (policy.paths?.[pathField] !== undefined) {
      delete stableSettings[settingKey]
    }
  }
  return {
    ...policy,
    extraSettings: { ...stableSettings, ...(policy.extraSettings ?? {}) },
  }
}

const stableRetroarchSettings = (
  context: ResolvedLaunchContext,
  env: XdgPathEnv,
): Effect.Effect<LaunchSettings, ResolutionError> =>
  stableRetroarchSettingsForIdentity({
    appId: context.appId ?? context.launcherId,
    system: context.system,
    contentPath: context.contentPath ?? "",
    env,
  })

const stableRetroarchSettingsForIdentity = (input: {
  readonly appId: string
  readonly system: string
  readonly contentPath: string
  readonly env: XdgPathEnv
}): Effect.Effect<LaunchSettings, ResolutionError> =>
  Effect.tryPromise({
    try: async () => {
      const identity = stableRetroarchIdentity(input.system, input.contentPath)
      const systemSegment = encodeURIComponent(input.system)
      const saveDir = korriDataPath(
        input.env,
        "retroarch",
        "v1",
        systemSegment,
        identity,
      )
      const stateDir = korriStatePath(
        input.env,
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
        appId: input.appId,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const stableRetroarchIdentity = (
  system: string,
  contentPath: string,
): string => {
  const hash = createHash("sha256")
    .update(`${system}\0${contentPath}`)
    .digest("hex")
  const basenamePrefix = basename(contentPath).slice(0, 80)
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
