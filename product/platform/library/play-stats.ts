/**
 * Play-stats derivation — the read projection over a game's play log.
 *
 * `lastPlayed`, `playCount`, and `totalPlaytimeSeconds` are all questions
 * asked of the {@link PlayEntry} list; none is stored independently, so they
 * cannot drift out of sync with each other. A game with no entries reads as
 * never played.
 */

import type { PlayEntry } from "./config/records/play-log"

/**
 * Default gate threshold, in seconds. `0` means any session that ran at all
 * qualifies. The gate is applied at write time (see `qualifiesForPlayLog`);
 * raising the threshold later never touches recording logic.
 */
export const DEFAULT_PLAY_LOG_THRESHOLD_SECONDS = 0

/**
 * Derived, read-only view of play history. Never persisted — always computed
 * from the play log at the read seam.
 */
export interface PlayStats {
  readonly lastPlayed?: Date
  readonly playCount: number
  readonly totalPlaytimeSeconds: number
}

export function derivePlayStats(entries: readonly PlayEntry[]): PlayStats {
  if (entries.length === 0) {
    return { playCount: 0, totalPlaytimeSeconds: 0 }
  }

  let lastPlayed = entries[0].occurredAt
  let totalPlaytimeSeconds = 0
  for (const entry of entries) {
    if (entry.occurredAt.getTime() > lastPlayed.getTime()) {
      lastPlayed = entry.occurredAt
    }
    totalPlaytimeSeconds += entry.durationSeconds
  }

  return { lastPlayed, playCount: entries.length, totalPlaytimeSeconds }
}

/**
 * Gate at the door: does a session of `durationSeconds` qualify to be logged?
 * Inclusive boundary, so a threshold of `0` admits any session.
 */
export function qualifiesForPlayLog(
  durationSeconds: number,
  thresholdSeconds: number = DEFAULT_PLAY_LOG_THRESHOLD_SECONDS,
): boolean {
  return durationSeconds >= thresholdSeconds
}
