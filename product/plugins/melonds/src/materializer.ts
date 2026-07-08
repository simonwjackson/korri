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
import { KORRI_MELONDS_PLUGIN_ID, KORRI_MELONDS_PRESENTER_COMMAND } from "./ids"
import {
  composeDirectMelonDsLaunchSpec,
  composeMelonDsLaunchSpec,
} from "./launch-spec"
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
    yield* writePresentationSupport(context, stateRoot, resolvedPolicy)

    const envParent = dirname(stateRoot)
    const baseEnv = {
      ...(context.env ?? {}),
      XDG_CONFIG_HOME: envParent,
      XDG_DATA_HOME: envParent,
    }
    const spec =
      resolvedPolicy.presentation?.intent === "matched-dual-screen"
        ? yield* materializeMatchedPresentationSpec({
            context,
            command,
            contentPath,
            stateRoot,
            policy: resolvedPolicy,
            baseEnv,
          })
        : yield* tryMaterialize(context, () =>
            composeMelonDsLaunchSpec({
              command,
              contentPath,
              policy: resolvedPolicy,
              ...(context.overrides?.args !== undefined
                ? { overridesArgs: context.overrides.args }
                : {}),
              env: baseEnv,
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
    await mkdir(join(stateRoot, "presentation"), { recursive: true })
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

const writePresentationSupport = (
  context: ReadableResolvedLaunchContext,
  stateRoot: string,
  policy: MelonDsPolicy,
): Effect.Effect<void, ResolutionError> =>
  tryMaterialize(context, async () => {
    if (policy.presentation?.menu?.hide !== true) return
    await writeAtomic(
      hideMenuStylesheetPath(stateRoot),
      "QMenuBar { height: 0px; max-height: 0px; border: none; }\nQMenuBar::item { padding: 0px; margin: 0px; }\n",
    )
  })

const materializeMatchedPresentationSpec = (input: {
  readonly context: ReadableResolvedLaunchContext
  readonly command: string
  readonly contentPath: string
  readonly stateRoot: string
  readonly policy: MelonDsPolicy
  readonly baseEnv: Readonly<Record<string, string>>
}): Effect.Effect<
  ReturnType<typeof composeMelonDsLaunchSpec>,
  ResolutionError
> =>
  tryMaterialize(input.context, async () => {
    const presentation = input.policy.presentation
    if (presentation?.intent !== "matched-dual-screen") {
      throw new Error("matched melonDS presentation policy is missing")
    }
    const wayland = presentation.wayland
    if (wayland === undefined) {
      throw new Error(
        "matched melonDS presentation requires trusted compositor control",
      )
    }

    const presenterEnv = matchedPresenterEnv(input.baseEnv, wayland)
    const melonDsSpec = composeDirectMelonDsLaunchSpec({
      command: input.command,
      contentPath: input.contentPath,
      policy: input.policy,
      ...(input.context.overrides?.args !== undefined
        ? { overridesArgs: input.context.overrides.args }
        : {}),
      env: presenterEnv,
    })
    const payloadPath = matchedPayloadPath(input.stateRoot)
    await writeAtomic(
      payloadPath,
      `${JSON.stringify(
        {
          version: 1,
          melonDs: melonDsSpec,
          wayland,
          selectors: {
            appId: "net.kuribo64.melonDS",
            topTitlePrefix: "[w1]",
            bottomTitlePrefix: "[w2]",
          },
          windows: presentation.windows,
          secondaryOutput: presentation.secondaryOutput ?? {
            output: presentation.windows.bottom.output,
            restore: "observed",
          },
          ...(presentation.menu?.hide === true
            ? { stylesheet: hideMenuStylesheetPath(input.stateRoot) }
            : {}),
        },
        null,
        2,
      )}\n`,
    )

    return composeMelonDsLaunchSpec({
      command: input.command,
      contentPath: input.contentPath,
      policy: input.policy,
      presenterCommand: KORRI_MELONDS_PRESENTER_COMMAND,
      presentationPayloadPath: payloadPath,
      env: presenterEnv,
    })
  })

function matchedPresenterEnv(
  env: Readonly<Record<string, string>>,
  wayland: NonNullable<MelonDsPolicy["presentation"]>["wayland"],
): Record<string, string> {
  if (wayland === undefined) {
    throw new Error("matched melonDS presentation requires compositor control")
  }
  const { DISPLAY: _display, GDK_BACKEND: _gdkBackend, ...safeEnv } = env
  return {
    ...safeEnv,
    WAYLAND_DISPLAY: wayland.display,
    SWAYSOCK: wayland.compositorSocket,
    QT_QPA_PLATFORM: "wayland",
  }
}

function matchedPayloadPath(stateRoot: string): string {
  return join(stateRoot, "presentation", "matched-dual-screen.json")
}

function hideMenuStylesheetPath(stateRoot: string): string {
  return join(stateRoot, "presentation", "hide-menubar.qss")
}

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
