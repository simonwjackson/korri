/**
 * Play-log store — the writable home for play history.
 *
 * Runtime user-state, not authored config, so it lives outside the readable
 * canonical YAML graph in its own keyed store. Two real implementations share
 * one contract: an in-memory store (tests, harnesses, and the default when no
 * durable store is wired) and a file-backed store (one JSON document per
 * playable id). Appends are gated at the door — sub-threshold sessions never
 * enter the log.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  decodePlayLog,
  emptyPlayLog,
  type PlayEntry,
  type PlayHistoryKey,
  type PlayLog,
} from "./config/records/play-log"
import {
  DEFAULT_PLAY_LOG_THRESHOLD_SECONDS,
  qualifiesForPlayLog,
} from "./play-stats"

export interface RecordPlayOptions {
  readonly thresholdSeconds?: number
}

export interface PlayLogStore {
  readonly load: (key: PlayHistoryKey) => Promise<PlayLog>
  /**
   * Append a qualifying entry for a (user, game). Returns `true` when it was
   * recorded, `false` when the gate rejected it (`durationSeconds` below the
   * threshold).
   */
  readonly record: (
    key: PlayHistoryKey,
    entry: PlayEntry,
    options?: RecordPlayOptions,
  ) => Promise<boolean>
}

const keyString = (key: PlayHistoryKey): string =>
  `${key.userId}\u0000${key.gameId}`

const appended = (log: PlayLog, entry: PlayEntry): PlayLog => ({
  userId: log.userId,
  gameId: log.gameId,
  entries: [...log.entries, entry],
})

const admits = (entry: PlayEntry, options?: RecordPlayOptions): boolean =>
  qualifiesForPlayLog(
    entry.durationSeconds,
    options?.thresholdSeconds ?? DEFAULT_PLAY_LOG_THRESHOLD_SECONDS,
  )

export function createInMemoryPlayLogStore(
  seed?: Iterable<PlayLog>,
): PlayLogStore {
  const logs = new Map<string, PlayLog>()
  if (seed)
    for (const log of seed)
      logs.set(keyString({ userId: log.userId, gameId: log.gameId }), log)

  return {
    load: async key => logs.get(keyString(key)) ?? emptyPlayLog(key),
    record: async (key, entry, options) => {
      if (!admits(entry, options)) return false
      const current = logs.get(keyString(key)) ?? emptyPlayLog(key)
      logs.set(keyString(key), appended(current, entry))
      return true
    },
  }
}

/**
 * Durable root for the file-backed play-log store. Runtime user-state, so it
 * lives under the state dir, not the config graph.
 */
export function playLogStoreRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.KORRI_PLAY_LOG_DIR) return env.KORRI_PLAY_LOG_DIR
  if (env.XDG_STATE_HOME) return join(env.XDG_STATE_HOME, "korri", "play-log")
  if (env.HOME) return join(env.HOME, ".local", "state", "korri", "play-log")
  return join(tmpdir(), "korri", "play-log")
}

let sharedStore: PlayLogStore | undefined

/**
 * The single process-wide play-log store. Both the library read projection
 * (deriving playStats) and the recording coordinator (writing plays) resolve
 * this one instance, so there is a single source of truth.
 */
export function sharedPlayLogStore(): PlayLogStore {
  if (!sharedStore) sharedStore = createFilePlayLogStore(playLogStoreRoot())
  return sharedStore
}

function isMalformedPlayLogError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "SchemaError")
  )
}

export function createFilePlayLogStore(root: string): PlayLogStore {
  const dirFor = (key: PlayHistoryKey) =>
    join(root, encodeURIComponent(key.userId))
  const pathFor = (key: PlayHistoryKey) =>
    join(dirFor(key), `${encodeURIComponent(key.gameId)}.json`)

  const readLog = async (key: PlayHistoryKey): Promise<PlayLog> => {
    try {
      const raw = await readFile(pathFor(key), "utf8")
      return decodePlayLog(JSON.parse(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyPlayLog(key)
      }
      if (isMalformedPlayLogError(error)) {
        return emptyPlayLog(key)
      }
      throw error
    }
  }

  return {
    load: readLog,
    record: async (key, entry, options) => {
      if (!admits(entry, options)) return false
      const next = appended(await readLog(key), entry)
      await mkdir(dirFor(key), { recursive: true })
      const serialized = {
        userId: next.userId,
        gameId: next.gameId,
        entries: next.entries.map(item => ({
          occurredAt: item.occurredAt.toISOString(),
          durationSeconds: item.durationSeconds,
          ...(item.releaseId ? { releaseId: item.releaseId } : {}),
        })),
      }
      const target = pathFor(key)
      const temporary = `${target}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(serialized, null, 2)}\n`)
      await rename(temporary, target)
      return true
    },
  }
}
