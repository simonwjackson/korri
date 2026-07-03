/**
 * Play log — the sole stored representation of a game's play history.
 *
 * Each qualifying session appends one {@link PlayEntry} (when it happened +
 * how long it lasted) to that game's {@link PlayLog}. Everything a reader
 * wants — last played, times played, total playtime — is derived from the
 * entries at the read seam (see `@platform/library/play-stats`), never
 * stored as its own field. There is no separate `lastPlayed`/`playtime`
 * representation.
 */

import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

export const PlayEntry = Schema.Struct({
  /** When the session occurred (its end time). */
  occurredAt: Schema.Union([Schema.Date, Schema.DateFromString]),
  /** How long the session lasted, in seconds. */
  durationSeconds: Schema.Number,
  /**
   * Release the session was launched from, when known. Provenance only:
   * aggregate stats ignore it. The release never owns the history.
   */
  releaseId: Schema.optional(Schema.String),
})
export type PlayEntry = Schema.Schema.Type<typeof PlayEntry>

/**
 * Identity of a play log: play history is personal, so it is keyed by the
 * (user, game) pair — never by the game or release alone.
 */
export interface PlayHistoryKey {
  readonly userId: string
  readonly gameId: string
}

export const PlayLog = Schema.Struct({
  /** The user this history belongs to. */
  userId: Schema.String,
  /** The game (playable id) this history is about. */
  gameId: Schema.String,
  /** Append-only list of qualifying sessions. */
  entries: Schema.Array(PlayEntry),
})
export type PlayLog = Schema.Schema.Type<typeof PlayLog>

/**
 * Derived, read-only view of a game's play history, carried on read/wire
 * entries. Never authored — always computed from the play log (see
 * `@platform/library/play-stats`). A game with no entries reads as never
 * played (`lastPlayed` absent, counts zero).
 */
export const PlayStats = Schema.Struct({
  lastPlayed: Schema.optional(
    Schema.Union([Schema.Date, Schema.DateFromString]),
  ),
  playCount: Schema.Number,
  totalPlaytimeSeconds: Schema.Number,
})
export type PlayStats = Schema.Schema.Type<typeof PlayStats>

export const decodePlayEntry = (input: unknown): PlayEntry =>
  Schema.decodeUnknownSync(PlayEntry)(input, STRICT)

export const decodePlayLog = (input: unknown): PlayLog =>
  Schema.decodeUnknownSync(PlayLog)(input, STRICT)

export const emptyPlayLog = (key: PlayHistoryKey): PlayLog => ({
  userId: key.userId,
  gameId: key.gameId,
  entries: [],
})
