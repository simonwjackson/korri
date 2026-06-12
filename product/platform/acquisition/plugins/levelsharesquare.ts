import type { PluginAcquireOutput } from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  ArtifactAcquisitionHint,
  SourceCandidate,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import type { ArtifactFacets } from "@platform/protocol/artifact/artifact"
import { Effect } from "effect"
import { AcquisitionError } from "../errors"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import type { AcquisitionPluginDefinition } from "./registry"

const SOURCE_NAME = "levelsharesquare"
const DISPLAY_NAME = "Level Share Square"
const DEFAULT_BASE_URL = "https://levelsharesquare.com"
const SMBR_INTERNAL_GAME_ID = 5
const SMBR_SYSTEM = "smbr"
const SMBR_FORMAT_ID = "smbr-level"
const SMBR_EXTENSION = "lvl"
const SOURCE_DATA_NAMESPACE = "levelsharesquare.v1"

export interface LevelShareSquarePluginOptions {
  readonly baseUrl?: string
  readonly webBaseUrl?: string
  readonly fetchImpl?: typeof fetch
}

interface LevelShareSquareRuntime {
  readonly baseUrl: string
  readonly webBaseUrl: string
  readonly fetchImpl: typeof fetch
}

interface LssAuthor {
  readonly _id?: unknown
  readonly id?: unknown
  readonly username?: unknown
  readonly name?: unknown
  readonly avatar?: unknown
}

interface LssLevel {
  readonly _id?: unknown
  readonly id?: unknown
  readonly name?: unknown
  readonly title?: unknown
  readonly author?: unknown
  readonly description?: unknown
  readonly status?: unknown
  readonly difficulty?: unknown
  readonly game?: unknown
  readonly gameVersion?: unknown
  readonly version?: unknown
  readonly tags?: unknown
  readonly plays?: unknown
  readonly favourites?: unknown
  readonly favorites?: unknown
  readonly rating?: unknown
  readonly raters?: unknown
  readonly rates?: unknown
  readonly thumbnail?: unknown
  readonly thumbnailUrl?: unknown
  readonly image?: unknown
  readonly featuredAt?: unknown
  readonly featuredDate?: unknown
}

interface LssGame {
  readonly internalID?: unknown
  readonly internalId?: unknown
  readonly id?: unknown
  readonly fileExtension?: unknown
  readonly extension?: unknown
}

const smbrArtifactHint = (file?: ArtifactAcquisitionHint["file"]) => ({
  kind: "content" as const,
  system: SMBR_SYSTEM,
  format: { id: SMBR_FORMAT_ID },
  ...(file ? { file } : {}),
})

export function createLevelShareSquarePluginDefinition(
  options: LevelShareSquarePluginOptions = {},
): AcquisitionPluginDefinition {
  const runtime = createRuntime(options)
  return {
    metadata: {
      sourceName: SOURCE_NAME,
      displayName: DISPLAY_NAME,
      module: "product/platform/acquisition/plugins/levelsharesquare",
      builtIn: true,
      enabledByDefault: true,
      legalRisk: "medium",
      credentialRequired: false,
    },
    parseCandidateUrl: url => parseLevelShareSquareCandidateUrl(url, runtime),
    search: (_context, request) =>
      Effect.gen(function* () {
        yield* fetchSmbrGame(runtime)
        const payload = yield* fetchJson(
          runtime,
          `/api/levels/filter/get?page=1&game=${SMBR_INTERNAL_GAME_ID}&search=${encodeURIComponent(request.query)}`,
        )
        return yield* decodeLssShape(() =>
          levelsFromSearch(payload).map(level => candidateFor(runtime, level)),
        )
      }),
    details: (_context, request) =>
      Effect.gen(function* () {
        yield* fetchSmbrGame(runtime)
        const level = yield* fetchLevelDetails(runtime, request.id)
        return yield* decodeLssShape(() => detailsFor(runtime, level))
      }),
    validateSource: context =>
      fetchSmbrGame(runtime).pipe(
        Effect.map(() => ({
          _tag: "HealthySource" as const,
          sourceName: SOURCE_NAME,
          checkedAt: context.checkedAt,
        })),
      ),
    acquireArtifact: (context, request) =>
      Effect.gen(function* () {
        const game = yield* fetchSmbrGame(runtime)
        const level = yield* fetchLevelDetails(runtime, request.id)
        const bytes = yield* fetchLevelBytes(runtime, request.id)
        return yield* decodeLssShape(() =>
          acquireOutputFor({ runtime, context, game, level, bytes }),
        )
      }),
  }
}

export const levelShareSquarePluginDefinition =
  createLevelShareSquarePluginDefinition()

export function parseLevelShareSquareCandidateUrl(
  input: string,
  options: Pick<LevelShareSquareRuntime, "webBaseUrl"> = {
    webBaseUrl: DEFAULT_BASE_URL,
  },
): string | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  const webHost = new URL(options.webBaseUrl).hostname
  if (url.hostname !== webHost) {
    return null
  }
  const match = url.pathname.match(/^\/levels\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function createRuntime({
  baseUrl = DEFAULT_BASE_URL,
  webBaseUrl = baseUrl,
  fetchImpl = globalThis.fetch,
}: LevelShareSquarePluginOptions): LevelShareSquareRuntime {
  if (!fetchImpl) {
    throw new AcquisitionError({
      reason: "configuration",
      sourceName: SOURCE_NAME,
      message: "global fetch is not available for Level Share Square",
    })
  }
  return {
    baseUrl: trimTrailingSlash(baseUrl),
    webBaseUrl: trimTrailingSlash(webBaseUrl),
    fetchImpl,
  }
}

function fetchSmbrGame(
  runtime: LevelShareSquareRuntime,
): Effect.Effect<LssGame, AcquisitionError> {
  return Effect.gen(function* () {
    const payload = yield* fetchJson(runtime, "/api/app/games/get")
    const game = gamesFromPayload(payload).find(
      game =>
        numberValue(game.internalID ?? game.internalId ?? game.id) ===
        SMBR_INTERNAL_GAME_ID,
    )
    if (!game) {
      return yield* Effect.fail(
        defective("Level Share Square no longer reports SMBR game metadata"),
      )
    }
    const extension = stringValue(game.fileExtension ?? game.extension)
    if (normalizeExtension(extension) !== SMBR_EXTENSION) {
      return yield* Effect.fail(
        defective(
          `Level Share Square SMBR game reports unsupported extension: ${extension ?? "missing"}`,
        ),
      )
    }
    return game
  })
}

function fetchLevelDetails(
  runtime: LevelShareSquareRuntime,
  id: string,
): Effect.Effect<LssLevel, AcquisitionError> {
  return fetchJson(
    runtime,
    `/api/levels/${encodeURIComponent(id)}?allAuthors=1`,
  ).pipe(
    Effect.flatMap(payload =>
      Effect.try({
        try: () => levelFromDetails(payload),
        catch: error =>
          error instanceof AcquisitionError
            ? error
            : defective(
                `Level Share Square level details are invalid: ${stringifyError(error)}`,
              ),
      }),
    ),
  )
}

function fetchLevelBytes(
  runtime: LevelShareSquareRuntime,
  id: string,
): Effect.Effect<Buffer, AcquisitionError> {
  return Effect.gen(function* () {
    const payload = yield* fetchJson(
      runtime,
      `/api/levels/${encodeURIComponent(id)}/code?noDescription=1&play=1`,
    )
    const extension = normalizeExtension(
      stringValue(objectValue(payload)?.extension),
    )
    if (extension && extension !== SMBR_EXTENSION) {
      return yield* Effect.fail(
        defective(
          `Level Share Square returned unsupported level extension: ${extension}`,
        ),
      )
    }
    const levelData = objectValue(objectValue(payload)?.levelData)
    const rawData = levelData?.data
    if (!Array.isArray(rawData)) {
      return yield* Effect.fail(
        defective("Level Share Square levelData.data is missing"),
      )
    }
    return yield* Effect.try({
      try: () => {
        const bytes = Buffer.from(rawData.map(byteValue))
        validateSmbrLevelBytes(bytes)
        return bytes
      },
      catch: error =>
        error instanceof AcquisitionError
          ? error
          : defective(
              `Level Share Square levelData is invalid: ${stringifyError(error)}`,
            ),
    })
  })
}

function fetchJson(
  runtime: LevelShareSquareRuntime,
  path: string,
): Effect.Effect<unknown, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await runtime.fetchImpl(`${runtime.baseUrl}${path}`)
      if (!response.ok) {
        throw new AcquisitionError({
          reason: "infrastructure",
          sourceName: SOURCE_NAME,
          message: `Level Share Square request failed with HTTP ${response.status}`,
        })
      }
      return await response.json()
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "infrastructure",
            sourceName: SOURCE_NAME,
            message: `Level Share Square request failed: ${stringifyError(error)}`,
          }),
  })
}

function candidateFor(
  runtime: LevelShareSquareRuntime,
  level: LssLevel,
): SourceCandidate {
  const id = requiredString(level._id ?? level.id, "level id")
  return {
    _tag: "SourceCandidate",
    sourceName: SOURCE_NAME,
    id,
    title: requiredString(level.name ?? level.title, "level title"),
    url: levelUrl(runtime, id),
    platform: SMBR_SYSTEM,
    artifact: smbrArtifactHint({
      extension: SMBR_EXTENSION,
      name: `${id}.lvl`,
    }),
    playable: playableFor(runtime, level),
  }
}

function detailsFor(
  runtime: LevelShareSquareRuntime,
  level: LssLevel,
): SourceDetails {
  const id = requiredString(level._id ?? level.id, "level id")
  const description = stringValue(level.description)
  return withoutUndefined({
    _tag: "SourceDetails" as const,
    sourceName: SOURCE_NAME,
    id,
    title: requiredString(level.name ?? level.title, "level title"),
    url: levelUrl(runtime, id),
    description,
    artifact: smbrArtifactHint({
      name: `${id}.lvl`,
      extension: SMBR_EXTENSION,
    }),
    playable: playableFor(runtime, level),
    facets: facetsFor(runtime, level),
  })
}

function playableFor(runtime: LevelShareSquareRuntime, level: LssLevel) {
  const id = requiredString(level._id ?? level.id, "level id")
  return {
    id,
    title: requiredString(level.name ?? level.title, "level title"),
    source: SOURCE_NAME,
    releases: [
      {
        id: "smbr-level",
        source: SOURCE_NAME,
        system: SMBR_SYSTEM,
        target: levelUrl(runtime, id),
        apps: [{ id: "smbr" }],
      },
    ],
  }
}

function acquireOutputFor({
  runtime,
  context,
  game,
  level,
  bytes,
}: {
  readonly runtime: LevelShareSquareRuntime
  readonly context: AcquisitionPluginContext
  readonly game: LssGame
  readonly level: LssLevel
  readonly bytes: Buffer
}): PluginAcquireOutput {
  const id = requiredString(level._id ?? level.id, "level id")
  return withoutUndefined({
    kind: "content" as const,
    system: SMBR_SYSTEM,
    format: { id: SMBR_FORMAT_ID },
    file: {
      name: `${id}.lvl`,
      extension: SMBR_EXTENSION,
      mediaType: "application/json",
      sizeBytes: bytes.length,
    },
    bytesBase64: bytes.toString("base64"),
    facets: facetsFor(runtime, level),
    provenance: {
      source: SOURCE_NAME,
      acquiredAt: context.clock.nowIso(),
      url: levelUrl(runtime, id),
    },
    externalIds: [{ namespace: SOURCE_NAME, id }],
    sourceData: {
      [SOURCE_DATA_NAMESPACE]: withoutUndefined({
        levelId: id,
        internalGameId: numberValue(
          game.internalID ?? game.internalId ?? game.id,
        ),
        status: stringValue(level.status),
        difficulty: stringValue(level.difficulty),
        gameVersion: stringValue(level.gameVersion ?? level.version),
        featuredAt: stringValue(level.featuredAt ?? level.featuredDate),
      }),
    },
  })
}

function facetsFor(
  runtime: LevelShareSquareRuntime,
  level: LssLevel,
): ArtifactFacets {
  const author = authorFromLevel(level)
  const description = stringValue(level.description)
  const authors = author
    ? [
        withoutUndefined({
          name: author.name,
          role: "author",
          url: author.id
            ? `${runtime.webBaseUrl}/users/${author.id}`
            : undefined,
        }),
      ]
    : undefined
  const tags = arrayOfStrings(level.tags)
  const mediaUrl = stringValue(
    level.thumbnail ?? level.thumbnailUrl ?? level.image,
  )
  const media = mediaUrl
    ? [{ kind: "image" as const, role: "thumbnail", url: mediaUrl }]
    : undefined
  const communityStats = numberRecord({
    plays: numberValue(level.plays),
    favourites: numberValue(level.favourites ?? level.favorites),
    rating: numberValue(level.rating),
    raters: numberValue(level.raters),
  })
  return withoutUndefined({
    title: { text: requiredString(level.name ?? level.title, "level title") },
    description: description ? { text: description } : undefined,
    credits: authors ? { authors } : undefined,
    tags: tags.length > 0 ? tags : undefined,
    communityStats,
    media,
  })
}

function authorFromLevel(
  level: LssLevel,
): { id?: string; name: string } | null {
  const author = objectValue(level.author) as LssAuthor | null
  if (!author) return null
  const name = stringValue(author.username ?? author.name)
  if (!name) return null
  return withoutUndefined({
    id: stringValue(author._id ?? author.id),
    name,
  })
}

function gamesFromPayload(payload: unknown): LssGame[] {
  const object = objectValue(payload)
  const games = Array.isArray(payload)
    ? payload
    : Array.isArray(object?.games)
      ? object.games
      : Array.isArray(object?.data)
        ? object.data
        : []
  return games.map(game => objectValue(game)).filter(isPresent)
}

function levelsFromSearch(payload: unknown): LssLevel[] {
  const object = objectValue(payload)
  const levels = Array.isArray(payload)
    ? payload
    : Array.isArray(object?.levels)
      ? object.levels
      : Array.isArray(object?.data)
        ? object.data
        : Array.isArray(object?.results)
          ? object.results
          : null
  if (!levels) throw defective("Level Share Square search levels are missing")
  return levels.map(level => objectValue(level)).filter(isPresent)
}

function levelFromDetails(payload: unknown): LssLevel {
  const object = objectValue(payload)
  const level = objectValue(object?.level ?? payload)
  if (!level) throw defective("Level Share Square level details are missing")
  return level
}

function validateSmbrLevelBytes(bytes: Buffer): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    throw defective(
      `Level Share Square levelData is not JSON: ${stringifyError(error)}`,
    )
  }
  const object = objectValue(parsed)
  if (!objectValue(object?.Info) || !Array.isArray(object?.Levels)) {
    throw defective("Level Share Square levelData is not an SMBR .lvl payload")
  }
}

function levelUrl(runtime: LevelShareSquareRuntime, id: string): string {
  return `${runtime.webBaseUrl}/levels/${encodeURIComponent(id)}`
}

function requiredString(value: unknown, label: string): string {
  const result = stringValue(value)
  if (!result) throw defective(`Level Share Square ${label} is missing`)
  return result
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function byteValue(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  ) {
    return value
  }
  throw defective("Level Share Square levelData contains a non-byte value")
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function normalizeExtension(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.startsWith(".")
    ? value.slice(1).toLowerCase()
    : value.toLowerCase()
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function numberRecord(
  value: Record<string, number | undefined>,
): Record<string, number> | undefined {
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] => entry[1] !== undefined,
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}

function decodeLssShape<A>(
  decode: () => A,
): Effect.Effect<A, AcquisitionError> {
  return Effect.try({
    try: decode,
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : defective(
            `Level Share Square response is invalid: ${stringifyError(error)}`,
          ),
  })
}

function defective(message: string): AcquisitionError {
  return new AcquisitionError({
    reason: "defective-source",
    sourceName: SOURCE_NAME,
    message,
  })
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
