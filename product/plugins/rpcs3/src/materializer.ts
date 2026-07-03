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
import { basename, dirname, isAbsolute, join } from "node:path"
import type { MaterializedReadableLaunch } from "@platform/library/config/app-materializer"
import {
  AppMaterializationFailed,
  type ResolutionError,
} from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { renderConfigYaml } from "./config-render"
import { mergeGuiIni } from "./gui-preseed"
import { KORRI_RPCS3_PLUGIN_ID } from "./ids"
import { composeRpcs3LaunchSpec } from "./launch-spec"
import { routeSettings } from "./mapping"
import {
  DEFAULT_RPCS3_FIRMWARE_SENTINEL,
  decodeRpcs3Policy,
  type Rpcs3Policy,
} from "./policy"

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

    const command = context.app.command
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

    const launchEnv = yield* buildLaunchEnv(context, stateRoot)

    const routed = routeSettings(resolvedPolicy)
    const configPath = yield* writeLaunchConfig(context, stateRoot, routed)
    yield* writeGuiPreseed(context, stateRoot, routed.iniEntries)

    const spec = yield* tryMaterialize(context, () =>
      composeRpcs3LaunchSpec({
        command,
        gameFolderPath,
        flags: routed.flags,
        ...(configPath !== undefined ? { configPath } : {}),
        ...(context.overrides?.args !== undefined
          ? { overridesArgs: context.overrides.args }
          : {}),
        env: launchEnv,
      }),
    )
    return { spec }
  })

/**
 * Build the launch env: consume the standard `context.env` and add the
 * plugin-produced RPCS3 state-dir vars. `state.root` **is** the RPCS3 config
 * dir (where dev_flash/config.yml live), which RPCS3 resolves as
 * `$XDG_CONFIG_HOME/rpcs3`; so XDG_CONFIG_HOME/HOME point at its parent and we
 * assert the state root is actually an `.../rpcs3` dir.
 */
const buildLaunchEnv = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
): Effect.Effect<Readonly<Record<string, string>>, ResolutionError> =>
  Effect.gen(function* () {
    if (basename(stateRoot) !== "rpcs3") {
      return yield* fail(
        context,
        `RPCS3 state.root must be an rpcs3 config dir (its basename must be "rpcs3"): ${stateRoot}`,
      )
    }
    const parent = dirname(stateRoot)
    return {
      ...(context.env ?? {}),
      XDG_CONFIG_HOME: parent,
      HOME: parent,
    }
  })

/**
 * Materialize the per-launch config.yml under the state root using the
 * read-merge-canonical model (U0): read the operator's canonical config.yml,
 * deep-merge routed settings + overrides.config, and write a per-release file
 * atomically. The operator's canonical config is never clobbered. Returns the
 * path for --config, or undefined when there is nothing to write.
 */
const writeLaunchConfig = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
  routed: ReturnType<typeof routeSettings>,
): Effect.Effect<string | undefined, ResolutionError> =>
  Effect.gen(function* () {
    const canonical = yield* readCanonicalConfig(context, stateRoot)
    const text = renderConfigYaml({
      ...(canonical !== undefined ? { canonical } : {}),
      entries: routed.configEntries,
      ...(context.overrides?.config !== undefined
        ? { overridesConfig: context.overrides.config }
        : {}),
    })
    if (text === undefined) return undefined
    const configPath = join(
      stateRoot,
      "korri",
      `config-${slugReleaseId(context.releaseId)}.yml`,
    )
    yield* writeAtomic(context, configPath, text)
    return configPath
  })

const readCanonicalConfig = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
): Effect.Effect<string | undefined, ResolutionError> =>
  readOptionalFile(context, join(stateRoot, "config.yml"))

/**
 * Preseed RPCS3's GUI popup toggles (GuiConfigs/CurrentSettings.ini) so
 * unattended launches don't stall on confirmation boxes. No-op when there are
 * no routed ini entries; otherwise merges into any existing file so unrelated
 * GUI state is preserved.
 */
const writeGuiPreseed = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
  iniEntries: ReturnType<typeof routeSettings>["iniEntries"],
): Effect.Effect<void, ResolutionError> =>
  Effect.gen(function* () {
    if (iniEntries.length === 0) return
    const iniPath = join(stateRoot, "GuiConfigs", "CurrentSettings.ini")
    const existing = yield* readOptionalFile(context, iniPath)
    yield* writeAtomic(context, iniPath, mergeGuiIni(existing, iniEntries))
  })

const readOptionalFile = (
  context: ReadableResolvedLaunchContext,
  path: string,
): Effect.Effect<string | undefined, ResolutionError> =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await readFile(path, "utf8")
      } catch {
        return undefined
      }
    },
    catch: error =>
      new AppMaterializationFailed({
        appId: context.app.id,
        reason: error instanceof Error ? error.message : String(error),
      }),
  })

const slugReleaseId = (releaseId: string): string =>
  releaseId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
  "launch"

const writeAtomic = (
  context: ReadableResolvedLaunchContext,
  path: string,
  contents: string,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(context, async () => {
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
