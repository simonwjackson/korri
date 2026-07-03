import { constants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import type { MaterializedReadableLaunch } from "@platform/library/config/app-materializer"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { composeRpcs3LaunchSpec } from "./launch-spec"
import {
  decodeRpcs3Policy,
  DEFAULT_RPCS3_FIRMWARE_SENTINEL,
  type Rpcs3Policy,
} from "./policy"
import { KORRI_RPCS3_PLUGIN_ID } from "./ids"

const STORAGE_TOKEN_PATTERN = /\{storage:([^}]+)\}/g

type StorageRoots = Readonly<Record<string, { readonly root?: string }>>

export const rpcs3ReadableLaunchIntegration: ReadableLaunchIntegration = {
  providerId: KORRI_RPCS3_PLUGIN_ID,
  kind: KORRI_RPCS3_PLUGIN_ID,
  integration: "rpcs3",
  canResolve: context =>
    context.app.plugin === KORRI_RPCS3_PLUGIN_ID &&
    context.content?.path !== undefined &&
    canDecodePolicy(context),
  materialize: context => materializeReadableRpcs3Launch({ context }),
}

export const materializeReadableRpcs3Launch = (input: {
  readonly context: ReadableResolvedLaunchContext
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (input.context.app.plugin !== KORRI_RPCS3_PLUGIN_ID) {
      return yield* fail(
        input.context,
        `typed RPCS3 materialization requires plugin: ${KORRI_RPCS3_PLUGIN_ID}`,
      )
    }

    const resources = yield* materializeReadableRpcs3Resources(input.context)
    return {
      spec: resources.spec,
      context: input.context,
    }
  })

const materializeReadableRpcs3Resources = (
  context: ReadableResolvedLaunchContext,
): Effect.Effect<
  { readonly spec: MaterializedReadableLaunch["spec"] },
  ResolutionError
> =>
  Effect.gen(function* () {
    const policy = yield* decodePolicy(context)
    const resolvedPolicy = yield* resolvePolicyStorageTokens(context, policy)
    const contentPath = context.content?.path
    if (contentPath === undefined) {
      return yield* fail(
        context,
        "typed RPCS3 launches require a resolved PS3 disc marker path",
      )
    }

    const command = resolvedPolicy.command ?? context.app.command
    if (command === undefined || !isAbsolute(command)) {
      return yield* fail(
        context,
        "RPCS3 launches require an absolute RPCS3 command",
      )
    }

    const gameFolderPath = dirname(contentPath)
    yield* validateReadableDirectory(context, gameFolderPath, "game folder")

    const stateRoot = resolvedPolicy.state?.root
    if (stateRoot === undefined || stateRoot.trim().length === 0) {
      return yield* fail(context, "typed RPCS3 launches require state.root")
    }
    yield* validateReadableDirectory(context, stateRoot, "state root")
    yield* validateFirmware(context, stateRoot, resolvedPolicy)

    const spec = yield* tryMaterialize(context, () =>
      composeRpcs3LaunchSpec({
        command,
        gameFolderPath,
        extraArgs: resolvedPolicy.extra?.args,
        env: mergeEnv(context.env, resolvedPolicy.env),
      }),
    )
    return { spec }
  })

function canDecodePolicy(context: ReadableResolvedLaunchContext): boolean {
  try {
    decodeRpcs3Policy(context.plugin?.[KORRI_RPCS3_PLUGIN_ID] ?? {})
    return true
  } catch {
    return false
  }
}

const decodePolicy = (
  context: ReadableResolvedLaunchContext,
): Effect.Effect<Rpcs3Policy, ResolutionError> =>
  Effect.try({
    try: () => decodeRpcs3Policy(context.plugin?.[KORRI_RPCS3_PLUGIN_ID] ?? {}),
    catch: error => error as ResolutionError,
  })

const resolvePolicyStorageTokens = (
  context: ReadableResolvedLaunchContext,
  policy: Rpcs3Policy,
): Effect.Effect<Rpcs3Policy, ResolutionError> =>
  tryMaterialize(context, () => ({
    ...policy,
    state: policy.state
      ? { root: resolveStorageTokens(policy.state.root, context.storage ?? {}) }
      : undefined,
    env: policy.env
      ? Object.fromEntries(
          Object.entries(policy.env).map(([key, value]) => [
            key,
            resolveStorageTokens(value, context.storage ?? {}),
          ]),
        )
      : undefined,
  }))

const resolveStorageTokens = (value: string, storage: StorageRoots): string =>
  value.replace(STORAGE_TOKEN_PATTERN, (_match, storageId: string) => {
    const root = storage[storageId]?.root
    if (!root) throw new Error(`unknown storage token: ${storageId}`)
    return root
  })

const validateFirmware = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
  policy: Rpcs3Policy,
): Effect.Effect<void, ResolutionError> => {
  const sentinel = policy.firmware?.sentinel ?? DEFAULT_RPCS3_FIRMWARE_SENTINEL
  return accessPath(context, join(stateRoot, sentinel), {
    failureReason: `RPCS3 firmware is missing; expected firmware sentinel at ${join(
      stateRoot,
      sentinel,
    )}`,
  })
}

const validateReadableDirectory = (
  context: ReadableResolvedLaunchContext,
  path: string,
  label: string,
): Effect.Effect<void, ResolutionError> =>
  Effect.gen(function* () {
    const info = yield* tryMaterialize(context, async () => stat(path))
    if (!info.isDirectory()) {
      return yield* fail(context, `RPCS3 ${label} is not a directory: ${path}`)
    }
    yield* accessPath(context, path, {
      failureReason: `RPCS3 ${label} is not readable: ${path}`,
    })
  })

const accessPath = (
  context: ReadableResolvedLaunchContext,
  path: string,
  options: { readonly failureReason: string },
): Effect.Effect<void, ResolutionError> =>
  Effect.tryPromise({
    try: async () => {
      await access(path, constants.R_OK)
    },
    catch: () =>
      new AppMaterializationFailed({
        appId: context.app.id,
        reason: options.failureReason,
      }),
  })

const fail = (
  context: ReadableResolvedLaunchContext,
  reason: string,
): Effect.Effect<never, ResolutionError> =>
  Effect.fail(
    new AppMaterializationFailed({
      appId: context.app.id,
      reason,
    }),
  )

const tryMaterialize = <Value>(
  context: ReadableResolvedLaunchContext,
  run: () => Value | Promise<Value>,
): Effect.Effect<Value, ResolutionError> =>
  Effect.tryPromise({
    try: async () => run(),
    catch: error =>
      new AppMaterializationFailed({
        appId: context.app.id,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const mergeEnv = (
  contextEnv: Readonly<Record<string, string>> | undefined,
  policyEnv: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined => {
  const merged = { ...(contextEnv ?? {}), ...(policyEnv ?? {}) }
  return Object.keys(merged).length > 0 ? merged : undefined
}
