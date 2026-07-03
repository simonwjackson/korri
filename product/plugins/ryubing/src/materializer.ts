import { constants } from "node:fs"
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import type { MaterializedReadableLaunch } from "@platform/library/config/app-materializer"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { composeRyubingLaunchSpec, renderRyubingConfig } from "./launch-spec"
import { KORRI_RYUBING_PLUGIN_ID } from "./plugin"
import { decodeRyubingPolicy, type RyubingPolicy } from "./policy"
import { resolveRyubingPolicyInput } from "./preferences-mapping"

const STATE_DIRS = [
  "system",
  "bis",
  "sdcard",
  "games",
  "profiles",
  "Logs",
] as const
const STORAGE_TOKEN_PATTERN = /\{storage:([^}]+)\}/g

type StorageRoots = Readonly<Record<string, { readonly root?: string }>>
type JsonObject = Record<string, unknown>

export const ryubingReadableLaunchIntegration: ReadableLaunchIntegration = {
  kind: KORRI_RYUBING_PLUGIN_ID,
  integration: "ryubing",
  canResolve: context =>
    Boolean(context.content?.path && readPolicy(context).state?.root),
  materialize: context => materializeReadableRyubingLaunch({ context }),
}

export const materializeReadableRyubingLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (input.context.app.plugin !== KORRI_RYUBING_PLUGIN_ID) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: `typed Ryubing materialization requires plugin: ${KORRI_RYUBING_PLUGIN_ID}`,
        }),
      )
    }
    const resources = yield* materializeReadableRyubingResources(input)
    return {
      spec: resources.spec,
      context: input.context,
      ...(resources.diagnostics ? { diagnostics: resources.diagnostics } : {}),
    }
  })

const readPolicy = (context: ReadableResolvedLaunchContext): RyubingPolicy =>
  decodeRyubingPolicy(
    resolveRyubingPolicyInput({
      preferences: context.preferences,
      plugin: context.plugin?.[KORRI_RYUBING_PLUGIN_ID] as
        | Record<string, unknown>
        | undefined,
    }),
  )

const materializeReadableRyubingResources = (input: {
  readonly context: ReadableResolvedLaunchContext
}) =>
  Effect.gen(function* () {
    const rawPolicy = readPolicy(input.context)
    const storage = input.context.storage ?? {}
    yield* assertStorageTokensAvailable(
      input.context.app.id,
      {
        ...rawPolicy,
        env: { ...(input.context.env ?? {}), ...(rawPolicy.env ?? {}) },
      },
      storage,
    )
    const policy = yield* tryMaterialize(input.context.app.id, async () =>
      resolveRyubingPolicyPaths(rawPolicy, storage),
    )
    const resolvedContextEnv = yield* tryMaterialize(
      input.context.app.id,
      async () =>
        input.context.env
          ? resolveEnvStorageTokens(input.context.env, storage)
          : undefined,
    )
    const stateRoot = policy.state?.root
    if (!stateRoot) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: "typed Ryubing launches require state.root",
        }),
      )
    }
    if (policy.state?.create !== false) {
      yield* createStateRoot(input.context.app.id, stateRoot)
    }
    yield* validateRequiredKeys(input.context.app.id, policy)

    const generated = renderRyubingConfig(policy)
    const configPath = join(
      stateRoot,
      policy.state?.["config-file"] ?? "Config.json",
    )
    const merged = yield* mergeExistingConfig({
      appId: input.context.app.id,
      configPath,
      generated,
      policy,
    })
    const finalConfig = merged.config
    yield* validateInputConfig(input.context.app.id, policy, finalConfig)
    yield* writeAtomic(
      input.context.app.id,
      configPath,
      `${JSON.stringify(finalConfig, null, 2)}\n`,
    )

    const contentPath = input.context.content?.path
    if (!contentPath) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason:
            "typed Ryubing launches require a resolved content path from a file-backed source",
        }),
      )
    }
    const spec = yield* tryMaterialize(input.context.app.id, async () =>
      composeRyubingLaunchSpec({
        command: input.context.app.command,
        policy,
        env: resolvedContextEnv,
        gamePath: contentPath,
      }),
    )
    return {
      paths: {},
      spec,
      ...(merged.diagnostics.length > 0
        ? { diagnostics: merged.diagnostics }
        : {}),
    }
  })

const resolveRyubingPolicyPaths = (
  policy: RyubingPolicy,
  storage: StorageRoots,
): RyubingPolicy => ({
  ...policy,
  state: policy.state
    ? {
        ...policy.state,
        ...(policy.state.root
          ? { root: resolveStorageTokens(policy.state.root, storage) }
          : {}),
      }
    : undefined,
  env: policy.env
    ? Object.fromEntries(
        Object.entries(policy.env).map(([key, value]) => [
          key,
          resolveStorageTokens(value, storage),
        ]),
      )
    : undefined,
  content: policy.content
    ? {
        ...policy.content,
        ...(policy.content["game-dirs"]
          ? {
              "game-dirs": policy.content["game-dirs"].map(path =>
                resolveStorageTokens(path, storage),
              ),
            }
          : {}),
        ...(policy.content["autoload-dirs"]
          ? {
              "autoload-dirs": policy.content["autoload-dirs"].map(path =>
                resolveStorageTokens(path, storage),
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

const resolveEnvStorageTokens = (
  env: Readonly<Record<string, string>>,
  storage: StorageRoots,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      resolveStorageTokens(value, storage),
    ]),
  )

const storageTokensInPolicy = (policy: RyubingPolicy): readonly string[] => {
  const tokens = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(STORAGE_TOKEN_PATTERN)) {
        if (match[1]) tokens.add(match[1])
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) visit(item)
    }
  }
  visit(policy)
  return [...tokens]
}

const assertStorageTokensAvailable = (
  appId: string,
  policy: RyubingPolicy,
  storage: StorageRoots,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    for (const storageId of storageTokensInPolicy(policy)) {
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

const createStateRoot = (
  appId: string,
  stateRoot: string,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    await assertLiteralMediaRootExists(stateRoot)
    await mkdir(stateRoot, { recursive: true, mode: 0o750 })
    await Promise.all(
      STATE_DIRS.map(name =>
        mkdir(join(stateRoot, name), { recursive: true, mode: 0o750 }),
      ),
    )
  })

const assertLiteralMediaRootExists = async (
  stateRoot: string,
): Promise<void> => {
  const mediaRoot = literalRunMediaRoot(stateRoot)
  if (!mediaRoot) return
  const info = await stat(mediaRoot)
  if (!info.isDirectory()) {
    throw new Error(`state.root media root is not a directory: ${mediaRoot}`)
  }
}

const literalRunMediaRoot = (path: string): string | undefined => {
  const absolute = resolve(path)
  const parts = absolute.split(sep).filter(Boolean)
  const index = parts.findIndex(
    (part, currentIndex) =>
      part === "run" && parts[currentIndex + 1] === "media",
  )
  if (index < 0) return undefined
  const userIndex = index + 2
  const storageIndex = index + 3
  const idIndex = index + 4
  if (parts[storageIndex] === "storage" && parts[idIndex]) {
    return `${sep}${parts.slice(0, idIndex + 1).join(sep)}`
  }
  if (parts[storageIndex]) {
    return `${sep}${parts.slice(0, storageIndex + 1).join(sep)}`
  }
  if (parts[userIndex]) {
    return `${sep}${parts.slice(0, userIndex + 1).join(sep)}`
  }
  return undefined
}

const validateRequiredKeys = (
  appId: string,
  policy: RyubingPolicy,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    const root = policy.state?.root
    if (!root) throw new Error("Ryubing key preflight requires state.root")
    for (const keyFile of policy.state?.require?.keys ?? ["prod.keys"]) {
      await access(join(root, "system", keyFile), constants.R_OK)
    }
  })

const mergeExistingConfig = (input: {
  readonly appId: string
  readonly configPath: string
  readonly generated: Readonly<Record<string, unknown>>
  readonly policy: RyubingPolicy
}): Effect.Effect<
  { readonly config: JsonObject; readonly diagnostics: readonly string[] },
  ResolutionError
> =>
  tryMaterialize(input.appId, async () => {
    const mergeExisting = input.policy.config?.["merge-existing"] !== false
    if (!mergeExisting)
      return { config: { ...input.generated }, diagnostics: [] }
    const diagnostics: string[] = []
    let existing: JsonObject = {}
    let existingVersion: unknown
    try {
      const raw = await readFile(input.configPath, "utf8")
      try {
        existing = JSON.parse(raw) as JsonObject
        existingVersion = existing.version
      } catch (error) {
        diagnostics.push(
          `Ryubing Config.json at ${input.configPath} is unreadable and will be regenerated: ${error instanceof Error ? error.message : String(error)}`,
        )
        existing = {}
      }
    } catch (error) {
      if (!isNodeErrorCode(error, "ENOENT")) throw error
    }
    const preserveUnknown = input.policy.config?.["preserve-unknown"] !== false
    const base = preserveUnknown ? existing : {}
    const merged = deepMergeJson(base, input.generated)
    if (existingVersion !== undefined) merged.version = existingVersion
    return { config: merged, diagnostics }
  })

const validateInputConfig = (
  appId: string,
  policy: RyubingPolicy,
  config: JsonObject,
): Effect.Effect<void, ResolutionError> => {
  if (policy.input?.["require-config"] === false) return Effect.void
  const inputConfig = config.input_config
  if (Array.isArray(inputConfig) && inputConfig.length > 0) return Effect.void
  return Effect.fail(
    new AppMaterializationFailed({
      appId,
      reason:
        "headless Ryubing launches require at least one input_config entry",
    }),
  )
}

const deepMergeJson = (
  base: JsonObject,
  extra: Readonly<Record<string, unknown>>,
): JsonObject => {
  const merged: JsonObject = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    const prior = merged[key]
    merged[key] =
      isJsonObject(prior) && isJsonObject(value)
        ? deepMergeJson(prior, value)
        : value
  }
  return merged
}

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const writeAtomic = (
  appId: string,
  path: string,
  contents: string,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    await mkdir(dirname(path), { recursive: true, mode: 0o750 })
    const temp = `${path}.tmp-${process.pid}-${Date.now()}`
    try {
      await writeFile(temp, contents, { mode: 0o640 })
      await rename(temp, path)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
  })

const tryMaterialize = <T>(
  appId: string,
  fn: () => Promise<T>,
): Effect.Effect<T, ResolutionError> =>
  Effect.tryPromise({
    try: fn,
    catch: error =>
      new AppMaterializationFailed({
        appId,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const isNodeErrorCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === code
