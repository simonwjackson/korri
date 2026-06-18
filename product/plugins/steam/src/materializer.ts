import { stat } from "node:fs/promises"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { parseSteamAppId } from "./launch-spec"
import { KORRI_STEAM_PLUGIN_ID } from "./plugin"
import {
  materializeSteamDesiredState,
  type SteamLifecycle,
  type SteamStateFileSystem,
  type SteamStateLock,
} from "./state-materializer"

const STORAGE_TOKEN_PATTERN = /\{storage:([^}]+)\}/g

export interface MaterializedReadableLaunch {
  readonly spec: LaunchSpec
  readonly context: ReadableResolvedLaunchContext
  readonly artifacts?: LaunchArtifacts
  readonly diagnostics?: readonly string[]
}

interface MaterializedSteamResources {
  readonly paths: Readonly<Record<string, string>>
  readonly spec: LaunchSpec
  readonly stateRoot: string
}

type StorageRoots = Readonly<Record<string, { readonly root?: string }>>

interface DecodedSteamPluginPolicy {
  state?: {
    root: string
  }
  extra?: {
    args?: readonly string[]
  }
  "launch-options"?: string
}

export const steamReadableLaunchIntegration: ReadableLaunchIntegration = {
  providerId: KORRI_STEAM_PLUGIN_ID,
  kind: KORRI_STEAM_PLUGIN_ID,
  integration: "steam",
  canResolve: context => canMaterializeSteamContext(context),
  materialize: context => materializeReadableSteamLaunch({ context }),
}

export const materializeReadableSteamLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly fs?: SteamStateFileSystem
  readonly lifecycle?: SteamLifecycle
  readonly lock?: SteamStateLock
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (input.context.app.kind !== KORRI_STEAM_PLUGIN_ID) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: `typed Steam materialization requires kind: ${KORRI_STEAM_PLUGIN_ID}`,
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

function canMaterializeSteamContext(
  context: ReadableResolvedLaunchContext,
): boolean {
  if (context.app.kind !== KORRI_STEAM_PLUGIN_ID) return false
  if (parseSteamAppId(context.target)._tag === "Left") return false
  try {
    const policy = readSteamPluginPolicy(context)
    return (
      typeof policy.state?.root === "string" && policy.state.root.length > 0
    )
  } catch {
    return false
  }
}

function readSteamPluginPolicy(
  context: ReadableResolvedLaunchContext,
): DecodedSteamPluginPolicy {
  const payload = context.plugin?.[KORRI_STEAM_PLUGIN_ID]
  if (payload === undefined) return {}
  if (!isRecord(payload)) {
    throw new AppMaterializationFailed({
      appId: context.app.id,
      reason: "Steam plugin policy must be an object",
    })
  }
  const policy: DecodedSteamPluginPolicy = {}
  const state = payload.state
  if (state !== undefined) {
    if (!isRecord(state) || typeof state.root !== "string") {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason: "Steam plugin policy state.root must be a string",
      })
    }
    policy.state = { root: state.root }
  }
  const extra = payload.extra
  if (extra !== undefined) {
    if (!isRecord(extra)) {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason: "Steam plugin policy extra must be an object",
      })
    }
    const args = extra.args
    if (args !== undefined) {
      if (!Array.isArray(args) || args.some(arg => typeof arg !== "string")) {
        throw new AppMaterializationFailed({
          appId: context.app.id,
          reason: "Steam plugin policy extra.args must be string array",
        })
      }
      policy.extra = { args }
    }
  }
  const launchOptions = payload["launch-options"]
  if (launchOptions !== undefined) {
    if (typeof launchOptions !== "string") {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason: "Steam plugin policy launch-options must be a string",
      })
    }
    policy["launch-options"] = launchOptions
  }
  return policy
}

const materializeReadableSteamResources = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly fs?: SteamStateFileSystem
  readonly lifecycle?: SteamLifecycle
  readonly lock?: SteamStateLock
}): Effect.Effect<MaterializedSteamResources, ResolutionError> =>
  Effect.gen(function* () {
    const rawPolicy = yield* Effect.try({
      try: () => readSteamPluginPolicy(input.context),
      catch: error => error as ResolutionError,
    })
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
          reason: "typed Steam launches require plugin.@korri:steam.state.root",
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

const resolveSteamPolicyPaths = (
  policy: DecodedSteamPluginPolicy,
  storage: StorageRoots,
): DecodedSteamPluginPolicy => ({
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
  policy: DecodedSteamPluginPolicy,
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
