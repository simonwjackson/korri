import { constants } from "node:fs"
import {
  link,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import type { AppIntegrationKind } from "@platform/library/config/app-integrations"
import {
  decodeGamescopePolicy,
  type GamescopePolicy,
} from "@platform/library/config/inheritable-fields"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"

export type GameStreamLaunchLifecycle = "foreground" | "session"
export type GameStreamLaunchAppIntegration = Extract<
  AppIntegrationKind,
  "steam"
>

export interface GameStreamLaunchIntent {
  readonly version: 1
  readonly id: string
  readonly createdAt: string
  readonly lifecycle: GameStreamLaunchLifecycle
  readonly launch: LaunchSpec
  readonly gamescope?: GamescopePolicy
  readonly appIntegration?: GameStreamLaunchAppIntegration
  readonly wait?: LaunchSpec
  readonly artifacts?: LaunchArtifacts
}

export interface ClaimedGameStreamLaunchIntent {
  readonly intent: GameStreamLaunchIntent
  complete: () => Promise<void>
  requeue: () => Promise<void>
  quarantine: (reason: string) => Promise<void>
}

export interface GameStreamLaunchIntentStore {
  enqueue: (intent: GameStreamLaunchIntent) => Promise<void>
  claim: () => Promise<ClaimedGameStreamLaunchIntent | undefined>
}

const DEFAULT_INTENT_MAX_AGE_MS = 5 * 60 * 1000
const PRIVATE_FILE_MODE = 0o600
const PRIVATE_DIRECTORY_MODE = 0o700

export function defaultGameStreamIntentPath(env: NodeJS.ProcessEnv): string {
  if (env.KORRI_GAME_STREAM_INTENT_PATH)
    return env.KORRI_GAME_STREAM_INTENT_PATH
  if (env.XDG_RUNTIME_DIR) {
    return join(env.XDG_RUNTIME_DIR, "korri-game-stream", "next-launch.json")
  }
  throw new Error(
    "KORRI_GAME_STREAM_INTENT_PATH or XDG_RUNTIME_DIR is required for launch intents",
  )
}

export function createLaunchIntent(
  launch: LaunchSpec,
  options: {
    readonly lifecycle?: GameStreamLaunchLifecycle
    readonly gamescope?: GamescopePolicy
    readonly appIntegration?: GameStreamLaunchAppIntegration
    readonly wait?: LaunchSpec
    readonly artifacts?: LaunchArtifacts
  } = {},
): GameStreamLaunchIntent {
  assertAbsoluteLaunchSpec(launch)
  if (options.wait) assertAbsoluteLaunchSpec(options.wait)
  const artifacts = options.artifacts
    ? decodeLaunchArtifacts(options.artifacts)
    : undefined

  return {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    lifecycle: options.lifecycle ?? "foreground",
    launch,
    ...(hasGamescopeOpinion(options.gamescope)
      ? { gamescope: options.gamescope }
      : {}),
    ...(options.appIntegration
      ? { appIntegration: options.appIntegration }
      : {}),
    ...(options.wait ? { wait: options.wait } : {}),
    ...(artifacts ? { artifacts } : {}),
  }
}

export function createStaticGameStreamLaunchIntentStore(
  launch: LaunchSpec,
  options: {
    readonly lifecycle?: GameStreamLaunchLifecycle
    readonly gamescope?: GamescopePolicy
    readonly appIntegration?: GameStreamLaunchAppIntegration
    readonly wait?: LaunchSpec
    readonly artifacts?: LaunchArtifacts
  } = {},
): GameStreamLaunchIntentStore {
  let consumed = false
  return {
    enqueue: async () => {
      throw new Error("static launch intent store does not support enqueue")
    },
    claim: async () => {
      if (consumed) return undefined
      consumed = true
      return {
        intent: createLaunchIntent(launch, options),
        complete: async () => undefined,
        requeue: async () => {
          consumed = false
        },
        quarantine: async () => undefined,
      }
    },
  }
}

export function createFileGameStreamLaunchIntentStore(
  intentPath: string,
  options: {
    readonly uid?: number
    readonly maxAgeMs?: number
  } = {},
): GameStreamLaunchIntentStore {
  const uid = options.uid ?? currentUid()
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_INTENT_MAX_AGE_MS

  return {
    async enqueue(intent) {
      await mkdir(dirname(intentPath), {
        recursive: true,
        mode: PRIVATE_DIRECTORY_MODE,
      })
      await assertTrustedParentDirectory(intentPath, uid)
      const temporaryPath = `${intentPath}.${process.pid}.${crypto.randomUUID()}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(intent, null, 2)}\n`, {
        mode: PRIVATE_FILE_MODE,
      })
      await assertTrustedIntentFile(temporaryPath, uid)
      await rename(temporaryPath, intentPath)
    },

    async claim() {
      await assertTrustedParentDirectory(intentPath, uid)
      const claimedPath = `${intentPath}.claimed.${process.pid}.${crypto.randomUUID()}`
      try {
        await rename(intentPath, claimedPath)
      } catch (error) {
        if (isFileNotFoundError(error)) return undefined
        throw error
      }

      try {
        await assertTrustedIntentFile(claimedPath, uid)
        const raw = await readTrustedFile(claimedPath)
        const intent = decodeLaunchIntent(JSON.parse(raw) as unknown)
        assertIntentFresh(intent, maxAgeMs)
        return {
          intent,
          complete: async () => {
            await unlinkIfExists(claimedPath)
          },
          requeue: async () => {
            try {
              await link(claimedPath, intentPath)
              await unlinkIfExists(claimedPath)
            } catch (error) {
              if (isFileExistsError(error)) {
                await quarantineClaimedPath(
                  claimedPath,
                  "pending launch intent already exists during requeue",
                )
                return
              }
              if (!isFileNotFoundError(error)) throw error
            }
          },
          quarantine: async reason => {
            await quarantineClaimedPath(claimedPath, reason)
          },
        }
      } catch (error) {
        await quarantineClaimedPath(claimedPath, errorMessage(error))
        throw error
      }
    },
  }
}

export function decodeLaunchIntent(value: unknown): GameStreamLaunchIntent {
  const record = decodeRecord(value, "launch intent must be an object")
  if (record.version !== 1) throw new Error("launch intent version must be 1")

  const id = decodeNonEmptyString(
    record.id,
    "launch intent id must be a non-empty string",
  )
  const createdAt = decodeNonEmptyString(
    record.createdAt,
    "launch intent createdAt must be a non-empty string",
  )
  const lifecycle = decodeLaunchLifecycle(record.lifecycle)
  const launch = decodeLaunchSpec(record.launch)
  const wait = decodeOptionalLaunchSpec(record.wait)
  assertAbsoluteLaunchSpec(launch)
  if (wait) assertAbsoluteLaunchSpec(wait)

  return withOptionalLaunchIntentFields(
    {
      version: 1,
      id,
      createdAt,
      lifecycle,
      launch,
    },
    {
      gamescope: decodeOptionalGamescopePolicy(record.gamescope),
      appIntegration: decodeOptionalAppIntegration(record.appIntegration),
      wait,
      artifacts: decodeOptionalLaunchArtifacts(record.artifacts),
    },
  )
}

function decodeOptionalLaunchSpec(value: unknown): LaunchSpec | undefined {
  return value === undefined ? undefined : decodeLaunchSpec(value)
}

function decodeOptionalGamescopePolicy(
  value: unknown,
): GamescopePolicy | undefined {
  return value === undefined ? undefined : decodeGamescopePolicy(value)
}

function decodeOptionalAppIntegration(
  value: unknown,
): GameStreamLaunchAppIntegration | undefined {
  if (value === undefined) return undefined
  if (value === "steam") return value
  throw new Error("launch intent appIntegration must be steam when present")
}

function decodeOptionalLaunchArtifacts(
  value: unknown,
): LaunchArtifacts | undefined {
  return value === undefined ? undefined : decodeLaunchArtifacts(value)
}

function decodeLaunchLifecycle(value: unknown): GameStreamLaunchLifecycle {
  if (value === undefined) return "foreground"
  if (value === "foreground" || value === "session") return value
  throw new Error("launch intent lifecycle must be foreground or session")
}

function withOptionalLaunchIntentFields(
  base: GameStreamLaunchIntent,
  optional: {
    readonly gamescope?: GamescopePolicy
    readonly appIntegration?: GameStreamLaunchAppIntegration
    readonly wait?: LaunchSpec
    readonly artifacts?: LaunchArtifacts
  },
): GameStreamLaunchIntent {
  return {
    ...base,
    ...(hasGamescopeOpinion(optional.gamescope)
      ? { gamescope: optional.gamescope }
      : {}),
    ...(optional.appIntegration
      ? { appIntegration: optional.appIntegration }
      : {}),
    ...(optional.wait ? { wait: optional.wait } : {}),
    ...(optional.artifacts ? { artifacts: optional.artifacts } : {}),
  }
}

function decodeLaunchArtifacts(value: unknown): LaunchArtifacts {
  const record = decodeRecord(value, "launch artifacts must be an object")
  return {
    root: decodeAbsolutePath(
      record.root,
      "launch artifacts root must be an absolute path",
    ),
    paths: decodeAbsolutePathRecord(
      record.paths,
      "launch artifacts paths must be an object",
      "launch artifact paths must be absolute paths",
    ),
  }
}

function decodeAbsolutePathRecord(
  value: unknown,
  recordMessage: string,
  pathMessage: string,
): Record<string, string> {
  const record = decodeRecord(value, recordMessage)
  const decoded: Record<string, string> = {}
  for (const [key, path] of Object.entries(record)) {
    decoded[key] = decodeAbsolutePath(path, pathMessage)
  }
  return decoded
}

function decodeRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(message)
}

function decodeNonEmptyString(value: unknown, message: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(message)
}

function decodeAbsolutePath(value: unknown, message: string): string {
  const path = decodeNonEmptyString(value, message)
  if (isAbsolute(path)) return path
  throw new Error(message)
}

function hasGamescopeOpinion(
  gamescope: GamescopePolicy | undefined,
): gamescope is GamescopePolicy {
  if (gamescope === undefined) return false
  return Object.entries(gamescope).some(([key, value]) => {
    if (value === undefined) return false
    if (key === "extraArgs") {
      return Array.isArray(value) && value.length > 0
    }
    return true
  })
}

function assertAbsoluteLaunchSpec(spec: LaunchSpec): void {
  if (!spec.command.startsWith("/")) {
    throw new Error("LaunchSpec.command must be absolute")
  }
}

async function assertTrustedParentDirectory(
  intentPath: string,
  uid: number | undefined,
): Promise<void> {
  const info = await lstat(dirname(intentPath))
  if (!info.isDirectory())
    throw new Error("launch intent parent is not a directory")
  if (uid !== undefined && info.uid !== uid) {
    throw new Error("launch intent parent must be owned by the runner user")
  }
  if ((info.mode & 0o077) !== 0) {
    throw new Error("launch intent parent must not be group/world accessible")
  }
}

async function assertTrustedIntentFile(
  path: string,
  uid: number | undefined,
): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error("launch intent must be a regular file")
    if (uid !== undefined && info.uid !== uid) {
      throw new Error("launch intent must be owned by the runner user")
    }
    if ((info.mode & 0o777) !== PRIVATE_FILE_MODE) {
      throw new Error("launch intent mode must be 0600")
    }
  } finally {
    await handle.close()
  }
}

async function readTrustedFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    return await handle.readFile("utf8")
  } finally {
    await handle.close()
  }
}

function assertIntentFresh(
  intent: GameStreamLaunchIntent,
  maxAgeMs: number,
): void {
  const createdAtMs = Date.parse(intent.createdAt)
  if (!Number.isFinite(createdAtMs)) {
    throw new Error("launch intent createdAt must be a valid timestamp")
  }
  if (Date.now() - createdAtMs > maxAgeMs) {
    throw new Error("launch intent expired")
  }
}

async function quarantineClaimedPath(
  path: string,
  reason: string,
): Promise<void> {
  const quarantinePath = `${path}.bad`
  await writeFile(`${quarantinePath}.reason`, `${reason}\n`, {
    mode: 0o600,
  }).catch(() => undefined)
  await rename(path, quarantinePath).catch(error => {
    if (!isFileNotFoundError(error)) throw error
  })
}

async function unlinkIfExists(path: string): Promise<void> {
  await unlink(path).catch(error => {
    if (!isFileNotFoundError(error)) throw error
  })
}

function currentUid(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function isFileExistsError(error: unknown): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === "EEXIST"
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
