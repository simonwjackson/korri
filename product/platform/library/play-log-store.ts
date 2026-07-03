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
import { join } from "node:path"

import {
  emptyPlayLog,
  type PlayEntry,
  type PlayLog,
  decodePlayLog,
} from "./config/records/play-log"
import {
  DEFAULT_PLAY_LOG_THRESHOLD_SECONDS,
  qualifiesForPlayLog,
} from "./play-stats"

export interface RecordPlayOptions {
  readonly thresholdSeconds?: number
}

export interface PlayLogStore {
  readonly load: (playableId: string) => Promise<PlayLog>
  /**
   * Append a qualifying entry. Returns `true` when it was recorded, `false`
   * when the gate rejected it (`durationSeconds` below the threshold).
   */
  readonly record: (
    playableId: string,
    entry: PlayEntry,
    options?: RecordPlayOptions,
  ) => Promise<boolean>
}

const appended = (log: PlayLog, entry: PlayEntry): PlayLog => ({
  playableId: log.playableId,
  entries: [...log.entries, entry],
})

const admits = (entry: PlayEntry, options?: RecordPlayOptions): boolean =>
  qualifiesForPlayLog(
    entry.durationSeconds,
    options?.thresholdSeconds ?? DEFAULT_PLAY_LOG_THRESHOLD_SECONDS,
  )

export function createInMemoryPlayLogStore(
  seed?: Iterable<readonly [string, PlayLog]>,
): PlayLogStore {
  const logs = new Map<string, PlayLog>()
  if (seed) for (const [id, log] of seed) logs.set(id, log)

  return {
    load: async playableId => logs.get(playableId) ?? emptyPlayLog(playableId),
    record: async (playableId, entry, options) => {
      if (!admits(entry, options)) return false
      const current = logs.get(playableId) ?? emptyPlayLog(playableId)
      logs.set(playableId, appended(current, entry))
      return true
    },
  }
}

export function createFilePlayLogStore(root: string): PlayLogStore {
  const pathFor = (id: string) => join(root, `${encodeURIComponent(id)}.json`)

  const readLog = async (playableId: string): Promise<PlayLog> => {
    try {
      const raw = await readFile(pathFor(playableId), "utf8")
      return decodePlayLog(JSON.parse(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyPlayLog(playableId)
      }
      throw error
    }
  }

  return {
    load: readLog,
    record: async (playableId, entry, options) => {
      if (!admits(entry, options)) return false
      const next = appended(await readLog(playableId), entry)
      await mkdir(root, { recursive: true })
      const serialized = {
        playableId: next.playableId,
        entries: next.entries.map(item => ({
          occurredAt: item.occurredAt.toISOString(),
          durationSeconds: item.durationSeconds,
        })),
      }
      const target = pathFor(playableId)
      const temporary = `${target}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(serialized, null, 2)}\n`)
      await rename(temporary, target)
      return true
    },
  }
}
