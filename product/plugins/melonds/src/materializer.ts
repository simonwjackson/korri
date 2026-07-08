import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { MaterializedReadableLaunch } from "@platform/library/config/app-materializer"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import { appRecordKind } from "@platform/library/config/records/app"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Effect } from "effect"
import { renderMelonDsConfig } from "./config-render"
import { KORRI_MELONDS_PLUGIN_ID } from "./ids"
import { composeMelonDsLaunchSpec } from "./launch-spec"
import { decodeMelonDsPolicy, type MelonDsPolicy } from "./policy"

const STORAGE_TOKEN_PATTERN = /\{storage:([^}]+)\}/g

export const materializeReadableMelonDsLaunch = (input: {
  readonly context: ReadableResolvedLaunchContext
}): Effect.Effect<MaterializedReadableLaunch, ResolutionError> =>
  Effect.gen(function* () {
    const context = input.context
    if (appRecordKind(context.app) !== KORRI_MELONDS_PLUGIN_ID) {
      return yield* fail(
        context,
        `melonDS materialization requires plugin: ${KORRI_MELONDS_PLUGIN_ID}`,
      )
    }

    const contentPath = context.content?.path
    if (contentPath === undefined || contentPath.trim().length === 0) {
      return yield* fail(
        context,
        "melonDS launches require a resolved Nintendo DS ROM path",
      )
    }

    const command = context.app.command
    if (command === undefined || !command.startsWith("/")) {
      return yield* fail(
        context,
        "melonDS launches require an absolute command",
      )
    }

    const policy = yield* decodePolicy(context)
    const resolvedPolicy = yield* resolvePolicyStorageTokens(context, policy)
    const stateRoot = resolvedPolicy.state?.root
    if (stateRoot === undefined || stateRoot.trim().length === 0) {
      return yield* fail(context, "melonDS launches require state.root")
    }
    if (basename(stateRoot) !== "melonDS") {
      return yield* fail(
        context,
        `melonDS state.root must be a melonDS config dir (its basename must be "melonDS"): ${stateRoot}`,
      )
    }

    yield* createStateDirectories(context, stateRoot)
    yield* writeConfig(context, stateRoot, resolvedPolicy)

    const envParent = dirname(stateRoot)
    const spec = yield* tryMaterialize(context, () =>
      composeMelonDsLaunchSpec({
        command,
        contentPath,
        policy: resolvedPolicy,
        ...(context.overrides?.args !== undefined
          ? { overridesArgs: context.overrides.args }
          : {}),
        env: {
          ...(context.env ?? {}),
          XDG_CONFIG_HOME: envParent,
          XDG_DATA_HOME: envParent,
        },
      }),
    )

    return { spec, context }
  })

function readPolicy(context: ReadableResolvedLaunchContext): MelonDsPolicy {
  return decodeMelonDsPolicy(
    context.plugin?.[KORRI_MELONDS_PLUGIN_ID] as unknown | undefined,
  )
}

const decodePolicy = (
  context: ReadableResolvedLaunchContext,
): Effect.Effect<MelonDsPolicy, ResolutionError> =>
  Effect.try({
    try: () => readPolicy(context),
    catch: error =>
      error instanceof AppMaterializationFailed
        ? error
        : new AppMaterializationFailed({
            appId: context.app.id,
            reason: error instanceof Error ? error.message : String(error),
          }),
  })

const resolvePolicyStorageTokens = (
  context: ReadableResolvedLaunchContext,
  policy: MelonDsPolicy,
): Effect.Effect<MelonDsPolicy, ResolutionError> =>
  Effect.gen(function* () {
    const root = policy.state?.root
    if (root === undefined) return policy
    const resolvedRoot = yield* resolveStorageTokens(context, root)
    return { ...policy, state: { root: resolvedRoot } }
  })

const resolveStorageTokens = (
  context: ReadableResolvedLaunchContext,
  value: string,
): Effect.Effect<string, ResolutionError> =>
  Effect.gen(function* () {
    let missing: string | undefined
    const resolved = value.replace(
      STORAGE_TOKEN_PATTERN,
      (_match, storageId) => {
        const root = context.storage?.[storageId]?.root
        if (root === undefined || root.trim().length === 0) {
          missing = storageId
          return ""
        }
        return root
      },
    )
    if (missing !== undefined) {
      return yield* fail(
        context,
        `melonDS policy references missing storage root: ${missing}`,
      )
    }
    return resolved
  })

const createStateDirectories = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(context, async () => {
    await mkdir(join(stateRoot, "saves"), { recursive: true })
    await mkdir(join(stateRoot, "savestates"), { recursive: true })
    await mkdir(join(stateRoot, "cheats"), { recursive: true })
  })

const writeConfig = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
  policy: MelonDsPolicy,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(context, async () =>
    writeAtomic(
      join(stateRoot, "melonDS.toml"),
      renderMelonDsConfig({
        policy,
        stateRoot,
      }),
    ),
  )

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(tempPath, content)
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

function tryMaterialize<T>(
  context: ReadableResolvedLaunchContext,
  run: () => T | Promise<T>,
): Effect.Effect<T, ResolutionError> {
  return Effect.tryPromise({
    try: async () => run(),
    catch: error =>
      new AppMaterializationFailed({
        appId: context.app.id,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })
}

function fail(
  context: ReadableResolvedLaunchContext,
  reason: string,
): Effect.Effect<never, ResolutionError> {
  return Effect.fail(
    new AppMaterializationFailed({ appId: context.app.id, reason }),
  )
}
