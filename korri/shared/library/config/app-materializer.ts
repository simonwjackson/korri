import { randomUUID } from "node:crypto"
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect } from "effect"

import type { AppDescriptor } from "./app-integrations"
import { AppMaterializationFailed, type ResolutionError } from "./errors"
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
}): Effect.Effect<MaterializedAppLaunch, ResolutionError> =>
  Effect.gen(function* () {
    if (
      input.app.integration === "generic-process" ||
      (input.app.integration !== "solarus" &&
        !requiresMaterialization(input.app))
    ) {
      return {
        launcher: appLauncherRecord(input.app),
        context: input.context,
      }
    }

    const root = input.artifactsRoot ?? process.env[LAUNCH_ARTIFACTS_DIR_ENV]
    if (!root) {
      return yield* Effect.fail(
        new AppMaterializationFailed({
          appId: input.app.id,
          reason: `${LAUNCH_ARTIFACTS_DIR_ENV} is required for app config materialization`,
        }),
      )
    }
    yield* evictStaleArtifacts(root, input.now ?? new Date())

    const artifactRoot = join(
      root,
      `${artifactSafeGameId(input.context.gameId)}-${randomUUID()}`,
    )
    yield* tryMaterialize(input.app.id, async () => {
      await mkdir(artifactRoot, { recursive: true, mode: 0o750 })
    })

    const paths: Record<string, string> = {}
    const contextExtras: {
      configPath?: string
      modulePath?: string
      configDir?: string
      userDir?: string
    } = {}
    const args = input.app.args
    let env = input.context.env

    switch (input.app.integration) {
      case "retroarch": {
        const configPath = join(artifactRoot, "retroarch.cfg")
        yield* writeAtomic(
          input.app.id,
          configPath,
          retroarchConfig(input.context.settings),
        )
        paths.configPath = configPath
        contextExtras.configPath = configPath
        if (input.context.modulePath) {
          contextExtras.modulePath = input.context.modulePath
        }
        break
      }
      case "mame": {
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
        paths.configDir = configDir
        paths.configPath = configPath
        contextExtras.configDir = configDir
        break
      }
      case "dolphin": {
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
        paths.userDir = userDir
        paths.configPath = configPath
        contextExtras.userDir = userDir
        break
      }
      case "solarus": {
        const stateDir = join(artifactRoot, "solarus-state")
        yield* tryMaterialize(input.app.id, async () => {
          await mkdir(stateDir, { recursive: true, mode: 0o750 })
        })
        paths.stateDir = stateDir
        env = { ...(env ?? {}), XDG_STATE_HOME: stateDir }
        break
      }
    }

    return {
      launcher: appLauncherRecord({ ...input.app, args }),
      context: {
        ...input.context,
        ...contextExtras,
        ...(env ? { env } : {}),
      },
      artifacts: { root: artifactRoot, paths },
    }
  })

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
