import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { decodeLaunchSpec, type LaunchSpec } from "@shared/library/launcher"

export interface GameStreamLaunchIntent {
  readonly version: 1
  readonly id: string
  readonly createdAt: string
  readonly launch: LaunchSpec
}

export interface GameStreamLaunchIntentStore {
  enqueue: (intent: GameStreamLaunchIntent) => Promise<void>
  consume: () => Promise<GameStreamLaunchIntent | undefined>
}

export function createLaunchIntent(launch: LaunchSpec): GameStreamLaunchIntent {
  return {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    launch,
  }
}

export function createStaticGameStreamLaunchIntentStore(
  launch: LaunchSpec,
): GameStreamLaunchIntentStore {
  let consumed = false
  return {
    enqueue: async () => {
      throw new Error("static launch intent store does not support enqueue")
    },
    consume: async () => {
      if (consumed) return undefined
      consumed = true
      return createLaunchIntent(launch)
    },
  }
}

export function createFileGameStreamLaunchIntentStore(
  intentPath: string,
): GameStreamLaunchIntentStore {
  return {
    async enqueue(intent) {
      await mkdir(dirname(intentPath), { recursive: true, mode: 0o700 })
      const temporaryPath = `${intentPath}.${process.pid}.${crypto.randomUUID()}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(intent, null, 2)}\n`, {
        mode: 0o600,
      })
      await rename(temporaryPath, intentPath)
    },

    async consume() {
      const raw = await readFile(intentPath, "utf8").catch(error => {
        if (isFileNotFoundError(error)) return undefined
        throw error
      })
      if (raw === undefined) return undefined

      const intent = decodeLaunchIntent(JSON.parse(raw) as unknown)
      await unlink(intentPath).catch(error => {
        if (!isFileNotFoundError(error)) throw error
      })
      return intent
    },
  }
}

export function decodeLaunchIntent(value: unknown): GameStreamLaunchIntent {
  if (!isRecord(value)) throw new Error("launch intent must be an object")
  if (value.version !== 1) throw new Error("launch intent version must be 1")
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error("launch intent id must be a non-empty string")
  }
  if (typeof value.createdAt !== "string" || value.createdAt.length === 0) {
    throw new Error("launch intent createdAt must be a non-empty string")
  }

  return {
    version: 1,
    id: value.id,
    createdAt: value.createdAt,
    launch: decodeLaunchSpec(value.launch),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}
