import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import type { AppRecord } from "@platform/library/config/records/app"
import type { LibraryItemRecord } from "@platform/library/config/records/library-item"
import type { RuntimeRecord } from "@platform/library/config/records/runtime"
import type { SourceRecord } from "@platform/library/config/records/source"
import type { StorageRecord } from "@platform/library/config/records/storage"
import type { LibraryRepository } from "@platform/library/proseql/library-repository"
import { logger } from "@platform/logger"
import { Effect } from "effect"
import { type EsSystem, parseEsSystems } from "./es-systems"
import { type GamelistEntry, parseGamelist } from "./gamelist"

export interface RocknixImportConfig {
  readonly repository: LibraryRepository
  readonly gamelistRoots: readonly string[]
  readonly esSystemsPath: string
  readonly launchCommand?: string
  /** Deprecated no-op: sidecar media is no longer imported into game metadata. */
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

const FIRST_ROM_SOURCE_ID = "local-roms"
const FIRST_ROM_SOURCE_TITLE = "Local ROMs"

export async function importRocknixLibrary(
  config: RocknixImportConfig,
): Promise<RocknixImportSummary> {
  const existingEntries = await Effect.runPromise(
    config.repository.listPlayableEntries(),
  )
  if (existingEntries.length > 0) {
    throw new Error(
      "ROCKNIX import requires an empty Korri library; reset the target library before importing a fresh ROCKNIX snapshot",
    )
  }

  const warnings: RocknixImportWarning[] = []
  let imported = 0
  let skipped = 0
  const seenExternalIds = new Set<string>()
  const gameIdGenerator = config.gameIdGenerator ?? (() => crypto.randomUUID())

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

  for (const [rootIndex, root] of config.gamelistRoots.entries()) {
    const sourceId = sourceIdForRoot(rootIndex)
    const found = await scanGamelistRoot(root, warnings)
    if (found.length > 0) {
      await Effect.runPromise(
        upsertRootSource(config.repository, { root, sourceId }),
      )
    }
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

      const app = composeApp({
        system,
        launchCommandOverride: config.launchCommand,
      })
      await Effect.runPromise(
        upsertSystemLaunch(config.repository, { system, app }),
      )

      for (const entry of sortEntriesForImport(entries)) {
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
        const libraryItem = composeLibraryItem({
          entry,
          system,
          romTarget: relativeTarget(root, romPath),
          gameId,
          sourceId,
          appId: app.id,
        })

        await Effect.runPromise(
          config.repository.upsertLibraryItem(libraryItem),
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

function upsertRootSource(
  repository: LibraryRepository,
  args: { readonly root: string; readonly sourceId: string },
): Effect.Effect<readonly [StorageRecord, SourceRecord], unknown> {
  return Effect.all([
    repository.upsertStorage({ id: args.sourceId, root: args.root }),
    repository.upsertSource({
      id: args.sourceId,
      title: sourceTitle(args.sourceId),
      kind: ["files"],
      storage: args.sourceId,
    }),
  ])
}

function upsertSystemLaunch(
  repository: LibraryRepository,
  args: { readonly system: EsSystem; readonly app: AppRecord },
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* repository.upsertApp(args.app)
    const runtime = runtimeForSystem(args.system)
    if (runtime) yield* repository.upsertRuntime(runtime)
    yield* repository.upsertSystem({
      id: args.system.name,
      apps: [
        {
          id: args.app.id,
          ...(runtime ? { runtime: runtime.id } : {}),
        },
      ],
      ...(args.system.defaultCore
        ? { cores: { [args.app.id]: args.system.defaultCore } }
        : {}),
    })
  })
}

function sortEntriesForImport(
  entries: readonly GamelistEntry[],
): readonly GamelistEntry[] {
  return [...entries].sort((left, right) => {
    const leftTime = left.lastPlayed?.getTime() ?? 0
    const rightTime = right.lastPlayed?.getTime() ?? 0
    return rightTime - leftTime
  })
}

function resolveRomPath(systemRoot: string, rawPath: string): string {
  if (rawPath.startsWith("/")) return rawPath
  const stripped = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath
  return join(systemRoot, stripped)
}

function relativeTarget(root: string, romPath: string): string {
  return relative(root, romPath).split(sep).join("/")
}

function rocknixExternalId(args: {
  readonly systemName: string
  readonly romPath: string
}): string {
  return `${args.systemName}:${args.romPath}`
}

function composeLibraryItem(args: {
  readonly entry: GamelistEntry
  readonly system: EsSystem
  readonly romTarget: string
  readonly gameId: string
  readonly sourceId: string
  readonly appId: string
}): LibraryItemRecord {
  const display = stripUndefined({
    description: args.entry.desc,
    developer: args.entry.developer,
    publisher: args.entry.publisher,
    releaseDate: args.entry.releaseDate?.toISOString(),
    genre: args.entry.genre ? [args.entry.genre] : undefined,
  })
  const item: LibraryItemRecord = {
    id: args.gameId,
    source: args.sourceId,
    ...(args.entry.name ? { title: args.entry.name } : {}),
    ...(Object.keys(display).length > 0 ? { display } : {}),
    releases: [
      {
        id: args.system.name,
        source: args.sourceId,
        system: args.system.name,
        target: args.romTarget,
        apps: [
          {
            id: args.appId,
            ...(args.system.defaultCore
              ? { runtime: args.system.defaultCore }
              : {}),
          },
        ],
      },
    ],
  }
  return item
}

function composeApp(args: {
  system: EsSystem
  launchCommandOverride: string | undefined
}): AppRecord {
  const tokens = args.system.commandTemplate
    .replaceAll("%CONTROLLERSCONFIG%", "")
    .split(/\s+/)
    .filter(token => token.length > 0)
    .filter(token => !token.startsWith("--controllers="))

  const [first, ...rest] = tokens
  const command = args.launchCommandOverride ?? first ?? ""

  return {
    id: appId(args.system),
    command: translateEsPlaceholders(command, args.system),
    args: rest.map(token => translateEsPlaceholders(token, args.system)),
    policy: {
      allowedCommands: [translateEsPlaceholders(command, args.system)],
    },
  }
}

function runtimeForSystem(system: EsSystem): RuntimeRecord | undefined {
  return system.defaultCore
    ? {
        id: system.defaultCore,
        kind: "libretro-core",
        path: system.defaultCore.startsWith("/")
          ? system.defaultCore
          : `/legacy-cores/${system.defaultCore}`,
      }
    : undefined
}

function translateEsPlaceholders(token: string, system: EsSystem): string {
  return token
    .replaceAll("%ROM%", "{content.path}")
    .replaceAll("%SYSTEM%", "{system}")
    .replaceAll("%CORE%", "{runtime.path}")
    .replaceAll("%EMULATOR%", system.defaultEmulator ?? "")
}

function appId(system: EsSystem): string {
  return ["rocknix", system.defaultEmulator]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .map(sanitizeProfileIdPart)
    .join("-")
}

function sourceIdForRoot(index: number): string {
  return index === 0
    ? FIRST_ROM_SOURCE_ID
    : `${FIRST_ROM_SOURCE_ID}-${index + 1}`
}

function sourceTitle(sourceId: string): string {
  return sourceId === FIRST_ROM_SOURCE_ID
    ? FIRST_ROM_SOURCE_TITLE
    : `${FIRST_ROM_SOURCE_TITLE} ${sourceId.replace(`${FIRST_ROM_SOURCE_ID}-`, "")}`
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
