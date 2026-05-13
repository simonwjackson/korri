import { randomUUID } from "node:crypto"
import { readdir } from "node:fs/promises"
import { join, parse as parsePath } from "node:path"
import type { GameRecord } from "@shared/fixtures/games/game"
import type { ProfileBackedLaunchTargetRecord } from "@shared/library/launcher-config/launch-target"
import type { LauncherProfileRecord } from "@shared/library/launcher-config/launcher-profile"
import type { LibraryRepository } from "@shared/library/proseql/library-repository"
import { logger } from "@shared/logger"
import { Effect } from "effect"
import { type EsSystem, parseEsSystems } from "./es-systems"
import { type GamelistEntry, parseGamelist } from "./gamelist"

export interface RocknixImportConfig {
  readonly repository: LibraryRepository
  readonly gamelistRoots: readonly string[]
  readonly esSystemsPath: string
  readonly launchCommand?: string
  readonly mediaRoot?: string
  readonly gameIdGenerator?: () => string
}

export interface RocknixImportWarning {
  readonly reason:
    | "missing-es-systems"
    | "missing-gamelist-root"
    | "unreadable-gamelist-root"
    | "missing-system"
    | "duplicate-game"
  readonly message: string
  readonly details?: Record<string, unknown>
}

export interface RocknixImportSummary {
  readonly imported: number
  readonly skipped: number
  readonly warnings: readonly RocknixImportWarning[]
}

const DEFAULT_MEDIA_ROOT = "/storage/.guest/korri/media/games"

const SIDECAR_MEDIA_FILES = [
  "cover-1024.jpg",
  "cover-512.webp",
  "poster-600x900.png",
  "hero-1280x720.webp",
  "banner-460x215.png",
] as const

export async function importRocknixLibrary(
  config: RocknixImportConfig,
): Promise<RocknixImportSummary> {
  const existingGames = await Effect.runPromise(config.repository.listGames())
  if (existingGames.length > 0) {
    throw new Error(
      "ROCKNIX import requires an empty Korri library; reset the target library before importing a fresh ROCKNIX snapshot",
    )
  }

  const warnings: RocknixImportWarning[] = []
  let imported = 0
  let skipped = 0
  const seenExternalIds = new Set<string>()
  const gameIdGenerator = config.gameIdGenerator ?? randomUUID

  const systemsText = await readTextFileSafe(config.esSystemsPath)
  if (systemsText === null) {
    warnings.push({
      reason: "missing-es-systems",
      message: "ROCKNIX es_systems.cfg was unreadable; no games imported",
      details: { esSystemsPath: config.esSystemsPath },
    })
    return { imported, skipped, warnings }
  }

  const systems = parseEsSystems(systemsText)
  const systemByName = new Map(systems.map(system => [system.name, system]))

  for (const root of config.gamelistRoots) {
    const found = await scanGamelistRoot(root, warnings)
    for (const { systemName, systemRoot, entries } of found) {
      const system = systemByName.get(systemName)
      if (!system) {
        skipped += entries.length
        warnings.push({
          reason: "missing-system",
          message: "ROCKNIX gamelist system is absent from es_systems.cfg",
          details: { systemName, gamelistRoot: root },
        })
        continue
      }

      for (const entry of entries) {
        const romPath = resolveRomPath(systemRoot, entry.path)
        const externalId = rocknixExternalId({
          systemName: system.name,
          romPath,
        })

        if (seenExternalIds.has(externalId)) {
          skipped += 1
          warnings.push({
            reason: "duplicate-game",
            message:
              "duplicate ROCKNIX import identity; keeping first occurrence",
            details: { externalId },
          })
          continue
        }

        seenExternalIds.add(externalId)
        const gameId = gameIdGenerator()
        const importedRecord = await composeImportedRecord({
          entry,
          system,
          romPath,
          gameId,
          mediaRoot: config.mediaRoot ?? DEFAULT_MEDIA_ROOT,
          launchCommandOverride: config.launchCommand,
        })

        await Effect.runPromise(
          config.repository.upsertImportedGame(importedRecord),
        )
        imported += 1
      }
    }
  }

  return { imported, skipped, warnings }
}

type FoundSystemGamelist = {
  readonly systemName: string
  readonly systemRoot: string
  readonly entries: readonly GamelistEntry[]
}

async function scanGamelistRoot(
  root: string,
  warnings: RocknixImportWarning[],
): Promise<readonly FoundSystemGamelist[]> {
  let entries: { name: string; isDirectory: () => boolean }[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") {
      warnings.push({
        reason: "missing-gamelist-root",
        message: "ROCKNIX gamelist root is absent; skipping",
        details: { root, code },
      })
      return []
    }
    warnings.push({
      reason: "unreadable-gamelist-root",
      message: "ROCKNIX gamelist root is unreadable; skipping",
      details: { root, error: (error as Error).message },
    })
    return []
  }

  const out: FoundSystemGamelist[] = []
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue
    const systemRoot = join(root, dirent.name)
    const gamelistPath = join(systemRoot, "gamelist.xml")
    const xml = await readTextFileSafe(gamelistPath)
    if (xml === null) continue
    const parsed = parseGamelist(xml)
    if (parsed.length === 0) continue
    out.push({ systemName: dirent.name, systemRoot, entries: parsed })
  }
  return out
}

async function readTextFileSafe(path: string): Promise<string | null> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return await file.text()
  } catch (error) {
    logger.warn(
      { path, error: (error as Error).message },
      "rocknix-importer: file read failed",
    )
    return null
  }
}

async function composeImportedRecord(args: {
  entry: GamelistEntry
  system: EsSystem
  romPath: string
  gameId: string
  mediaRoot: string
  launchCommandOverride: string | undefined
}): Promise<{
  game: GameRecord
  launcherProfile: LauncherProfileRecord
  launchTarget: ProfileBackedLaunchTargetRecord
}> {
  const media = await findSidecarMedia({
    mediaRoot: args.mediaRoot,
    systemName: args.system.name,
    romPath: args.romPath,
  })

  const game = composeGameRecord(args.gameId, args.entry, media)
  const launcherProfile = composeLauncherProfile({
    system: args.system,
    launchCommandOverride: args.launchCommandOverride,
  })

  return {
    game,
    launcherProfile,
    launchTarget: {
      id: args.gameId,
      profile: launcherProfile.id,
      contentPath: args.romPath,
    },
  }
}

function resolveRomPath(systemRoot: string, rawPath: string): string {
  if (rawPath.startsWith("/")) return rawPath
  const stripped = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath
  return join(systemRoot, stripped)
}

function rocknixExternalId(args: {
  readonly systemName: string
  readonly romPath: string
}): string {
  return `${args.systemName}:${args.romPath}`
}

async function findSidecarMedia(args: {
  mediaRoot: string
  systemName: string
  romPath: string
}): Promise<ReadonlyArray<{ type: "image"; uri: string }>> {
  const romStem = parsePath(args.romPath).name
  const found: Array<{ type: "image"; uri: string }> = []

  for (const fileName of SIDECAR_MEDIA_FILES) {
    const path = join(args.mediaRoot, args.systemName, romStem, fileName)
    if (!(await Bun.file(path).exists())) continue
    found.push({
      type: "image",
      uri: `/api/media/games/${encodeURIComponent(args.systemName)}/${encodeURIComponent(romStem)}/${encodeURIComponent(fileName)}`,
    })
  }

  return found
}

function composeGameRecord(
  id: string,
  entry: GamelistEntry,
  media: ReadonlyArray<{ type: "image"; uri: string }>,
): GameRecord {
  const metadata = stripUndefined({
    name: entry.name,
    description: entry.desc,
    developer: entry.developer,
    publisher: entry.publisher,
    releaseDate: entry.releaseDate?.toISOString(),
    genre: entry.genre ? [entry.genre] : undefined,
    media: media.length > 0 ? media : undefined,
  })
  const userData = stripUndefined({
    lastPlayed: entry.lastPlayed,
    playtime: entry.playtimeSeconds,
    favorite: entry.favorite,
  })

  const record: GameRecord = { id }
  if (Object.keys(metadata).length > 0) {
    Object.assign(record, { metadata })
  }
  if (Object.keys(userData).length > 0) {
    Object.assign(record, { userData })
  }
  return record
}

function composeLauncherProfile(args: {
  system: EsSystem
  launchCommandOverride: string | undefined
}): LauncherProfileRecord {
  const tokens = args.system.commandTemplate
    .replaceAll("%CONTROLLERSCONFIG%", "")
    .split(/\s+/)
    .filter(token => token.length > 0)
    .filter(token => !token.startsWith("--controllers="))

  const [first, ...rest] = tokens
  const command = args.launchCommandOverride ?? first ?? ""

  return {
    id: launcherProfileId(args.system),
    command: translateEsPlaceholders(command),
    args: rest.map(translateEsPlaceholders),
    defaults: stripUndefined({
      system: args.system.name,
      core: args.system.defaultCore,
      emulator: args.system.defaultEmulator,
    }),
  }
}

function translateEsPlaceholders(token: string): string {
  return token
    .replaceAll("%ROM%", "{contentPath}")
    .replaceAll("%SYSTEM%", "{system}")
    .replaceAll("%CORE%", "{core}")
    .replaceAll("%EMULATOR%", "{emulator}")
}

function launcherProfileId(system: EsSystem): string {
  return ["rocknix", system.defaultEmulator, system.name, system.defaultCore]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .map(sanitizeProfileIdPart)
    .join(".")
}

function sanitizeProfileIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
}

function stripUndefined<T extends Record<string, unknown>>(
  input: T,
): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value
  }
  return out as Partial<T>
}
