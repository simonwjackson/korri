import { stat } from "node:fs/promises"
import { applyArgsOverrides } from "@platform/library/config/apply-overrides"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import { appRecordKind } from "@platform/library/config/records/app"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"
import { Effect } from "effect"
import { parseSteamAppId } from "./launch-spec"
import {
  defaultSteamPluginPolicy,
  KORRI_STEAM_PLUGIN_ID,
  STEAM_BASELINE_WRAPPER_ARGS,
} from "./plugin"
import { steamLaunchCleanupMetadata } from "./session/lifecycle-hook"
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
  readonly launchMetadata?: LaunchMetadata
  readonly artifacts?: LaunchArtifacts
  readonly diagnostics?: readonly string[]
}

interface MaterializedSteamResources {
  readonly paths: Readonly<Record<string, string>>
  readonly appId: string
  readonly spec: LaunchSpec
  readonly stateRoot: string
}

type StorageRoots = Readonly<Record<string, { readonly root?: string }>>

interface DecodedSteamPluginPolicy {
  state?: {
    root: string
  }
  "launch-options"?: string
  "compat-tool"?: string
  "compat-tool-overrides"?: Readonly<Record<string, string>>
  "first-launch"?: {
    "suppress-interstitials"?: boolean
    "accept-eulas"?: boolean
  }
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
    if (appRecordKind(input.context.app) !== KORRI_STEAM_PLUGIN_ID) {
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
      launchMetadata: steamLaunchMetadata(resources.appId),
    }
  })

function canMaterializeSteamContext(
  context: ReadableResolvedLaunchContext,
): boolean {
  if (appRecordKind(context.app) !== KORRI_STEAM_PLUGIN_ID) return false
  if (parseSteamAppId(context.target)._tag === "Left") return false
  try {
    assertGamescopeCompanionEnabled(context)
    const policy = readSteamPluginPolicy(context)
    return (
      typeof policy.state?.root === "string" && policy.state.root.length > 0
    )
  } catch {
    return false
  }
}

function steamLaunchMetadata(appId: string): LaunchMetadata {
  return {
    appProviderId: KORRI_STEAM_PLUGIN_ID,
    annotations: {
      [KORRI_STEAM_PLUGIN_ID]: {
        steamSession: true,
        foregroundCleanup: steamLaunchCleanupMetadata({ appId }),
      },
    },
  }
}

function assertGamescopeCompanionEnabled(
  _context: ReadableResolvedLaunchContext,
): void {
  // The Steam plugin-owned korri-steam-app wrapper is now the only AppID
  // launch contract. It owns starting/waiting for gamescoped Steam Big
  // Picture, so readable Steam AppID materialization must not depend on an
  // external @korri:gamescope companion being authored on every game.
}

function readSteamPluginPolicy(
  context: ReadableResolvedLaunchContext,
): DecodedSteamPluginPolicy {
  const payload = context.plugin?.[KORRI_STEAM_PLUGIN_ID]
  if (payload === undefined) return defaultSteamPluginPolicy
  if (!isRecord(payload)) {
    throw new AppMaterializationFailed({
      appId: context.app.id,
      reason: "Steam plugin policy must be an object",
    })
  }
  // The retired `extra` field is gone (converged onto release.launch.overrides).
  // Reject it loudly rather than silently ignoring, matching the strict decode
  // the other plugins already enforce — no backwards compatibility.
  if ("extra" in payload) {
    throw new AppMaterializationFailed({
      appId: context.app.id,
      reason:
        "Steam plugin policy `extra` was removed; use release.launch.overrides.args",
    })
  }
  const policy: DecodedSteamPluginPolicy = {
    state: defaultSteamPluginPolicy.state,
    "compat-tool": defaultSteamPluginPolicy["compat-tool"],
    "first-launch": defaultSteamPluginPolicy["first-launch"],
  }
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
  const compatTool = payload["compat-tool"]
  if (compatTool !== undefined) {
    if (typeof compatTool !== "string" || compatTool.length === 0) {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason: "Steam plugin policy compat-tool must be a non-empty string",
      })
    }
    policy["compat-tool"] = compatTool
  }
  const compatToolOverrides = payload["compat-tool-overrides"]
  if (compatToolOverrides !== undefined) {
    if (!isRecord(compatToolOverrides)) {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason: "Steam plugin policy compat-tool-overrides must be an object",
      })
    }
    const overrides: Record<string, string> = {}
    for (const [appId, tool] of Object.entries(compatToolOverrides)) {
      if (typeof tool !== "string" || tool.length === 0) {
        throw new AppMaterializationFailed({
          appId: context.app.id,
          reason:
            "Steam plugin policy compat-tool-overrides values must be non-empty strings",
        })
      }
      overrides[appId] = tool
    }
    policy["compat-tool-overrides"] = overrides
  }
  const firstLaunch = payload["first-launch"]
  if (firstLaunch !== undefined) {
    if (!isRecord(firstLaunch)) {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason: "Steam plugin policy first-launch must be an object",
      })
    }
    const suppressInterstitials = firstLaunch["suppress-interstitials"]
    const acceptEulas = firstLaunch["accept-eulas"]
    if (
      suppressInterstitials !== undefined &&
      typeof suppressInterstitials !== "boolean"
    ) {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason:
          "Steam plugin policy first-launch.suppress-interstitials must be a boolean",
      })
    }
    if (acceptEulas !== undefined && typeof acceptEulas !== "boolean") {
      throw new AppMaterializationFailed({
        appId: context.app.id,
        reason:
          "Steam plugin policy first-launch.accept-eulas must be a boolean",
      })
    }
    policy["first-launch"] = {
      ...policy["first-launch"],
      ...(suppressInterstitials !== undefined
        ? { "suppress-interstitials": suppressInterstitials }
        : {}),
      ...(acceptEulas !== undefined ? { "accept-eulas": acceptEulas } : {}),
    }
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
    yield* Effect.try({
      try: () => assertGamescopeCompanionEnabled(input.context),
      catch: error => error as ResolutionError,
    })
    const parsedAppId = parseSteamAppId(input.context.target)
    if (parsedAppId._tag === "Left") {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.context.app.id,
          reason: `InvalidSteamTarget: ${parsedAppId.left.target}`,
        }),
      )
    }
    const rawPolicy = yield* Effect.try({
      try: () => readSteamPluginPolicy(input.context),
      catch: error => error as ResolutionError,
    })
    const storage = input.context.storage ?? {}
    // Baseline Korri wrapper args form the routed segment that
    // release.launch.overrides.args prepend/append/replace around.
    const wrapperArgs = applyArgsOverrides({
      leading: [],
      routed: [...STEAM_BASELINE_WRAPPER_ARGS],
      trailing: [],
      ...(input.context.overrides?.args !== undefined
        ? { overrides: input.context.overrides.args }
        : {}),
    })
    yield* assertSteamStorageTokensAvailable(
      input.context.app.id,
      rawPolicy,
      wrapperArgs,
      storage,
    )
    const policy = yield* tryMaterialize(input.context.app.id, async () =>
      resolveSteamPolicyPaths(rawPolicy, storage),
    )
    const resolvedWrapperArgs = yield* tryMaterialize(
      input.context.app.id,
      async () => wrapperArgs.map(arg => resolveStorageTokens(arg, storage)),
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
        defaultCompatTool: policy["compat-tool"],
        compatToolOverrides: policy["compat-tool-overrides"],
        suppressInterstitials:
          policy["first-launch"]?.["suppress-interstitials"],
        acceptEulas: policy["first-launch"]?.["accept-eulas"],
        extraArgs: resolvedWrapperArgs,
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
      appId: parsedAppId.right,
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
  wrapperArgs: readonly string[],
  storage: StorageRoots,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(appId, async () => {
    for (const storageId of storageTokensInValue({
      state: policy.state,
      args: wrapperArgs,
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
