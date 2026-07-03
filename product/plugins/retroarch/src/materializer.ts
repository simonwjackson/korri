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
import {
  AppMaterializationFailed,
  PatchFileMissing,
  PatchFileNotRegular,
  PatchFileUnreadable,
  patchExtensionForPath,
  type ResolutionError,
  supportedPatchFormatForPath,
  UnsupportedPatchExtension,
} from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import {
  composeRetroArchLaunchSpec,
  renderRetroArchConfig,
} from "./launch-spec"
import { KORRI_RETROARCH_PLUGIN_ID } from "./plugin"
import {
  decodeRetroArchPolicy,
  type LaunchSettingValue,
  type RetroArchPolicy,
} from "./policy"

const LAUNCH_ARTIFACTS_DIR_ENV = "KORRI_LAUNCH_ARTIFACTS_DIR" as const
export const STALE_ARTIFACT_RETENTION_MS = 24 * 60 * 60 * 1000

export interface MaterializedReadableLaunch {
  readonly spec: LaunchSpec
  readonly context: ReadableResolvedLaunchContext
  readonly artifacts?: LaunchArtifacts
  readonly diagnostics?: readonly string[]
}

export const retroarchReadableLaunchIntegration: ReadableLaunchIntegration = {
  providerId: KORRI_RETROARCH_PLUGIN_ID,
  kind: KORRI_RETROARCH_PLUGIN_ID,
  integration: "retroarch",
  canResolve: context =>
    canMaterializeRetroArchContext(context) &&
    canDecodeRetroArchPluginPolicy(context),
  materialize: (context, options) =>
    materializeReadableRetroArchLaunch({ context, env: options?.env }),
}

export const materializeReadableRetroArchLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly artifactsRoot?: string
  readonly now?: Date
  readonly env?: XdgPathEnv
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    yield* validateRetroArchRuntimeKind(input.context)
    const root = yield* resolveArtifactsRoot({
      appId: input.context.app.id,
      artifactsRoot: input.artifactsRoot,
      env: input.env,
    })
    yield* evictStaleArtifacts(root, input.now ?? new Date())
    const artifactRoot = yield* createReadableArtifactRoot(input, root)
    return yield* materializeReadableWithPartialCleanup(input, artifactRoot)
  })

function canMaterializeRetroArchContext(
  context: ReadableResolvedLaunchContext,
): boolean {
  const policy = safeReadRetroArchPluginPolicy(context)
  const hasContentPath =
    context.content?.path !== undefined || policy?.content?.path !== undefined
  const hasCorePath =
    context.runtime?.path !== undefined || policy?.core?.path !== undefined
  return hasContentPath && hasCorePath && hasCompatibleRuntimeKind(context)
}

function hasCompatibleRuntimeKind(
  context: ReadableResolvedLaunchContext,
): boolean {
  return (
    context.runtime === undefined || context.runtime.kind === "libretro-core"
  )
}

function validateRetroArchRuntimeKind(
  context: ReadableResolvedLaunchContext,
): Effect.Effect<void, ResolutionError> {
  if (hasCompatibleRuntimeKind(context)) return Effect.void
  return Effect.fail(
    new AppMaterializationFailed({
      appId: context.app.id,
      reason: `RetroArch requires a libretro-core runtime; ${context.runtime?.id} is ${context.runtime?.kind}`,
    }),
  )
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
  if (payload === undefined) return undefined
  const policy = decodeRetroArchPolicy(payload)
  return Object.keys(policy).length > 0 ? policy : undefined
}

function safeReadRetroArchPluginPolicy(
  context: ReadableResolvedLaunchContext,
): RetroArchPolicy | undefined {
  try {
    return readRetroArchPluginPolicy(context)
  } catch {
    return undefined
  }
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
}

const materializeReadableRetroArchResources = (
  input: Parameters<typeof materializeReadableRetroArchLaunch>[0],
  artifactRoot: string,
): Effect.Effect<MaterializedReadableResources, ResolutionError> =>
  Effect.gen(function* () {
    let policy = (yield* decodeRetroArchPluginPolicy(input.context)) ?? {}
    let contentPath = policy.content?.path ?? input.context.content?.path
    if (contentPath === undefined) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason:
            "typed RetroArch launches require a resolved content path or plugin.@korri:retroarch.content.path override",
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
      renderRetroArchConfig(policy, input.context.overrides),
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
        ...(input.context.overrides
          ? { overrides: input.context.overrides }
          : {}),
      }),
    )
    return { paths, spec }
  })

interface StagedRetroarchPatchLaunch {
  readonly contentPath: string
  readonly paths: Readonly<Record<string, string>>
  readonly settings: Record<string, LaunchSettingValue>
}

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

const mergeStableRetroArchSettings = (
  policy: RetroArchPolicy,
  settings: Record<string, LaunchSettingValue>,
): RetroArchPolicy => {
  // Inject Korri-owned stable save/state directories into the typed paths
  // policy (not an escape hatch), leaving any operator-set paths untouched.
  // stableRetroarchSettingsForIdentity only ever emits these two cfg keys.
  const savefile = settings.savefile_directory
  const savestate = settings.savestate_directory
  const paths = { ...(policy.paths ?? {}) }
  if (paths.savefileDirectory === undefined && typeof savefile === "string") {
    paths.savefileDirectory = savefile
  }
  if (paths.savestateDirectory === undefined && typeof savestate === "string") {
    paths.savestateDirectory = savestate
  }
  return { ...policy, paths }
}

const stableRetroarchSettingsForIdentity = (input: {
  readonly appId: string
  readonly system: string
  readonly contentPath: string
  readonly env: XdgPathEnv
}): Effect.Effect<Record<string, string>, ResolutionError> =>
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

const resolveArtifactsRoot = (input: {
  readonly appId: string
  readonly artifactsRoot?: string
  readonly env?: XdgPathEnv
}): Effect.Effect<string, ResolutionError> => {
  const explicitRoot =
    input.artifactsRoot ??
    input.env?.[LAUNCH_ARTIFACTS_DIR_ENV] ??
    process.env[LAUNCH_ARTIFACTS_DIR_ENV]
  if (explicitRoot) return Effect.succeed(explicitRoot)
  return Effect.try({
    try: () => korriCachePath(input.env ?? process.env, "launch-artifacts"),
    catch: error =>
      new AppMaterializationFailed({
        appId: input.appId,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })
}

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

const artifactSafeGameId = (gameId: string): string =>
  gameId.replace(/[/\\]/g, "-")

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

export type RetroArchReadableMaterialization = MaterializedReadableLaunch
