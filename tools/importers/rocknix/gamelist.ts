/**
 * Pure parser for ROCKNIX `gamelist.xml` files.
 *
 * Returns one record per `<game>` block. `<folder>` blocks are skipped.
 * Garbage input does not throw — it returns `[]` so a missing/malformed
 * gamelist degrades gracefully when scanned alongside good ones.
 *
 * Field mapping is intentionally minimal — only what a player-facing rail
 * needs and what the LaunchSpec composer (Unit 3) consumes downstream.
 *
 * Real ROCKNIX format (probed live from the live ROCKNIX device):
 *   - Element name is `<gameList>` (camelCase). The opening `<?xml ?>`
 *     prologue is sometimes absent (e.g., the ports gamelist).
 *   - `<path>` is relative, prefixed with `./`.
 *   - `<lastplayed>` and `<releasedate>` are `YYYYMMDDTHHmmss` (no separators,
 *     no timezone). Per AGENTS.md, these are interpreted as UTC.
 *   - `<gametime>` is integer seconds.
 *   - `<favorite>` is `true` / `false` text.
 *   - `<genre>` is plain text (we do not split it; the schema permits a
 *     readonly array, so we wrap the single string in a one-element tuple).
 *   - Game names contain `&`, `<`, `>`, etc. — escaped via XML entities.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 2).
 */

import { logger } from "@shared/logger/logger"

export type GamelistEntry = {
  /** Raw `<path>` value as written in the gamelist (typically `./relative.ext`). */
  readonly path: string
  readonly name?: string
  readonly desc?: string
  readonly developer?: string
  readonly publisher?: string
  readonly releaseDate?: Date
  readonly genre?: string
  readonly lastPlayed?: Date
  readonly playtimeSeconds?: number
  readonly playcount?: number
  readonly favorite?: boolean
}

/**
 * Parse a `gamelist.xml` body. Returns `[]` when input is empty, malformed,
 * or contains zero `<game>` blocks. Does not throw on garbage input.
 */
export function parseGamelist(xml: string): readonly GamelistEntry[] {
  if (!xml || typeof xml !== "string") return []

  const blocks = extractBlocks(xml, "game")
  if (blocks.length === 0) return []

  const entries: GamelistEntry[] = []
  for (const block of blocks) {
    const entry = parseGameBlock(block)
    if (entry) entries.push(entry)
  }
  return entries
}

function parseGameBlock(block: string): GamelistEntry | undefined {
  const path = extractText(block, "path")
  if (!path) return undefined

  const releaseRaw = extractText(block, "releasedate")
  const lastPlayedRaw = extractText(block, "lastplayed")
  const playtimeRaw = extractText(block, "gametime")
  const playcountRaw = extractText(block, "playcount")
  const favoriteRaw = extractText(block, "favorite")

  return stripUndefined({
    path,
    name: extractText(block, "name"),
    desc: extractText(block, "desc"),
    developer: extractText(block, "developer"),
    publisher: extractText(block, "publisher"),
    genre: extractText(block, "genre"),
    releaseDate: releaseRaw ? parseRocknixDate(releaseRaw) : undefined,
    lastPlayed: lastPlayedRaw ? parseRocknixDate(lastPlayedRaw) : undefined,
    playtimeSeconds: playtimeRaw ? parseIntegerSafe(playtimeRaw) : undefined,
    playcount: playcountRaw ? parseIntegerSafe(playcountRaw) : undefined,
    favorite: favoriteRaw ? parseBooleanSafe(favoriteRaw) : undefined,
  })
}

/**
 * Extract every `<tag>...</tag>` block (top-level by simple matching). The
 * regex-driven approach assumes ROCKNIX never nests `<game>` inside `<game>`,
 * which holds in every real sample we have. `<folder>` is matched separately
 * and ignored.
 */
function extractBlocks(xml: string, tag: string): readonly string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g")
  const out: string[] = []
  for (const m of xml.matchAll(re)) {
    out.push(m[1] ?? "")
  }
  return out
}

function extractText(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  const m = block.match(re)
  if (!m) return undefined
  const raw = (m[1] ?? "").trim()
  if (raw === "") return undefined
  return decodeEntities(raw)
}

function decodeEntities(s: string): string {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
}

/**
 * Parse `YYYYMMDDTHHmmss` as UTC. Returns `undefined` (and logs a warning)
 * for unrecognized formats — never throws.
 */
function parseRocknixDate(value: string): Date | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (!m) {
    logger.warn({ value }, "rocknix.gamelist: ignored unrecognized date value")
    return undefined
  }
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    ),
  )
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

function parseIntegerSafe(value: string): number | undefined {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

function parseBooleanSafe(value: string): boolean | undefined {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  return undefined
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}
