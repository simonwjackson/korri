/**
 * `LibrarySource` implementation that reads a real ROCKNIX library off disk.
 *
 * - `list()` discovers `<system>/gamelist.xml` files under each configured
 *   gamelist root, parses them with `parseGamelist`, joins each entry to its
 *   `<system>` config from `parseEsSystems`, and returns `GameRecord[]`
 *   sorted by `lastPlayed` desc with undefined values last.
 * - `launchSpecFor(id)` returns the `LaunchSpec` for a game seen during the
 *   last `list()` call, or `undefined` if the id is unknown. Specs are
 *   resolved lazily but reuse the parsed system data from `list()`.
 *
 * Caching: the parsed library is held in memory until process restart, per
 * the plan's MVP scope. A long session that adds gamelist entries on disk
 * will not see them until Korri is relaunched. Documented as a known
 * limitation; cache invalidation is a future iteration.
 *
 * Substitution surface: `LaunchSpec.launchCommand` is configurable so tests
 * can point launches at `tools/testing/fake-game.sh` instead of
 * `/usr/bin/runemu.sh`. Everything else (parser, sort, spec composer) is
 * the same code path that runs in production.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 3).
 */

import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"

import { korriDataPath, type XdgPathEnv } from "@shared/config/xdg-paths"
import { normalizeGamescopePolicy } from "@shared/library/config/inheritable-fields"
import type { GameRecord } from "@shared/library/config/records/game"
import { logger } from "@shared/logger/logger"

import type { LaunchSpec } from "../launcher"
import type { LibrarySource } from "../library-source"
import { type EsSystem, parseEsSystems } from "./es-systems"
import { type GamelistEntry, parseGamelist } from "./gamelist"

export type RocknixConfig = {
  /** Roots under which `<system>/gamelist.xml` files live. */
  readonly gamelistRoots: readonly string[]
  /** Absolute path to `es_systems.cfg`. */
  readonly esSystemsPath: string
  /**
   * Override the launch command (the first token of the `<command>` template).
   * Tests pass `tools/testing/fake-game.sh`; production leaves this undefined,
   * which uses the command actually written in `es_systems.cfg`.
   */
  readonly launchCommand?: string
  /** Korri-owned sidecar art root: `<root>/<system>/<rom-stem>/<image>`. */
  readonly mediaRoot?: string
  /**
   * Permit a display-only fallback when the guest can see gamelists but not
   * ROCKNIX's `es_systems.cfg`.
   */
  readonly allowMissingEsSystems?: boolean
}

export function defaultRocknixMediaRoot(env: XdgPathEnv = process.env): string {
  return korriDataPath(env, "media", "games")
}

export const DEFAULT_ROCKNIX_GAMELIST_ROOTS = [
  "/storage/roms",
  "/storage/games-internal/roms",
  "/storage/games-external/roms",
] as const

export const DEFAULT_ROCKNIX_ES_SYSTEMS_PATH =
  "/storage/.config/emulationstation/es_systems.cfg"

export function defaultRocknixConfig(
  env: XdgPathEnv = process.env,
): RocknixConfig {
  return {
    gamelistRoots: DEFAULT_ROCKNIX_GAMELIST_ROOTS,
    esSystemsPath: DEFAULT_ROCKNIX_ES_SYSTEMS_PATH,
    mediaRoot: defaultRocknixMediaRoot(env),
  }
}

export function createRocknixSource(
  config: RocknixConfig = defaultRocknixConfig(),
): LibrarySource {
  // Cached on first list(); shared with launchSpecFor(id).
  let cachedRecords: readonly GameRecord[] | null = null
  let cachedSpecs: ReadonlyMap<string, LaunchSpec> | null = null

  async function loadIfNeeded(): Promise<{
    records: readonly GameRecord[]
    specs: ReadonlyMap<string, LaunchSpec>
  }> {
    if (cachedRecords && cachedSpecs) {
      return { records: cachedRecords, specs: cachedSpecs }
    }

    const systems = await loadSystems({
      esSystemsPath: config.esSystemsPath,
      allowMissingEsSystems: config.allowMissingEsSystems === true,
    })
    const allowGamelistOnlyFallback =
      systems === undefined && config.allowMissingEsSystems === true
    const systemByName = new Map((systems ?? []).map(s => [s.name, s] as const))

    const records: GameRecord[] = []
    const specs = new Map<string, LaunchSpec>()

    for (const root of config.gamelistRoots) {
      const found = await scanGamelistRoot(root)
      for (const { systemName, systemRoot, entries } of found) {
        const sys = systemByName.get(systemName)
        if (!sys && !allowGamelistOnlyFallback) {
          logger.warn(
            { systemName, gamelistRoot: root },
            "rocknix-source: dropping games for system not in es_systems.cfg",
          )
          continue
        }
        for (const entry of entries) {
          const { record, spec } = sys
            ? await composeRecordAndSpec({
                entry,
                system: sys,
                systemRoot,
                launchCommandOverride: config.launchCommand,
              })
            : await composeFallbackRecordAndSpec({
                entry,
                systemName,
                systemRoot,
                launchCommandOverride: config.launchCommand,
              })
          if (specs.has(record.id)) {
            // Two games on disk with the same composed id (rare — same
            // basename in two roots). Keep the first; log the second.
            logger.warn(
              { id: record.id },
              "rocknix-source: duplicate id; keeping first occurrence",
            )
            continue
          }
          records.push(record)
          specs.set(record.id, spec)
        }
      }
    }

    records.sort(compareByLastPlayedDesc)

    cachedRecords = records
    cachedSpecs = specs
    return { records, specs }
  }

  return {
    async list(): Promise<readonly GameRecord[]> {
      const { records } = await loadIfNeeded()
      return records
    },

    async launchSpecFor(id: string): Promise<LaunchSpec | undefined> {
      const { specs } = await loadIfNeeded()
      return specs.get(id)
    },

    async resolveLaunchForGame(id: string) {
      const { specs } = await loadIfNeeded()
      const spec = specs.get(id)
      if (!spec) {
        throw new Error(`rocknix-source: no launch spec for game ${id}`)
      }
      return { spec, gamescope: normalizeGamescopePolicy(undefined) }
    },
  }
}

async function loadSystems(args: {
  esSystemsPath: string
  allowMissingEsSystems: boolean
}): Promise<readonly EsSystem[] | undefined> {
  const text = await readTextFileSafe(args.esSystemsPath)
  if (text === null) {
    if (args.allowMissingEsSystems) {
      logger.warn(
        { esSystemsPath: args.esSystemsPath },
        "rocknix-source: es_systems.cfg unreadable; using gamelist-only fallback",
      )
    } else {
      logger.error(
        { esSystemsPath: args.esSystemsPath },
        "rocknix-source: es_systems.cfg unreadable; library will be empty",
      )
    }
    return undefined
  }
  return parseEsSystems(text)
}

type FoundSystemGamelist = {
  systemName: string
  systemRoot: string
  entries: readonly GamelistEntry[]
}

async function scanGamelistRoot(
  root: string,
): Promise<readonly FoundSystemGamelist[]> {
  let entries: { name: string; isDirectory: () => boolean }[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") {
      logger.warn(
        { root, code },
        "rocknix-source: gamelist root absent; skipping",
      )
      return []
    }
    logger.error(
      { root, error: (error as Error).message },
      "rocknix-source: gamelist root unreadable; skipping",
    )
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
      "rocknix-source: file read failed",
    )
    return null
  }
}

async function composeFallbackRecordAndSpec(args: {
  entry: GamelistEntry
  systemName: string
  systemRoot: string
  launchCommandOverride: string | undefined
}): Promise<{ record: GameRecord; spec: LaunchSpec }> {
  const { entry, systemName, systemRoot, launchCommandOverride } = args
  const absRomPath = resolveRomPath(systemRoot, entry.path)
  const id = `${systemName}/${basename(absRomPath)}`

  const record = composeGameRecord(id, systemName, absRomPath, entry)
  const spec = composeFallbackLaunchSpec({
    launchCommandOverride,
    romPath: absRomPath,
  })

  return { record, spec }
}

async function composeRecordAndSpec(args: {
  entry: GamelistEntry
  system: EsSystem
  systemRoot: string
  launchCommandOverride: string | undefined
}): Promise<{ record: GameRecord; spec: LaunchSpec }> {
  const { entry, system, systemRoot, launchCommandOverride } = args
  const absRomPath = resolveRomPath(systemRoot, entry.path)
  const id = `${system.name}/${basename(absRomPath)}`

  const record = composeGameRecord(id, system.name, absRomPath, entry)
  const spec = composeLaunchSpec({
    template: system.commandTemplate,
    launchCommandOverride,
    romPath: absRomPath,
    systemName: system.name,
    coreName: system.defaultCore,
    emulatorName: system.defaultEmulator,
  })

  return { record, spec }
}

function resolveRomPath(systemRoot: string, rawPath: string): string {
  // ROCKNIX writes `<path>./relative.ext</path>`. Absolute paths are also
  // tolerated (some scrapers normalize to absolute).
  if (rawPath.startsWith("/")) return rawPath
  const stripped = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath
  return join(systemRoot, stripped)
}

function composeGameRecord(
  id: string,
  systemName: string,
  contentPath: string,
  entry: GamelistEntry,
): GameRecord {
  const metadata = stripUndefined({
    name: entry.name,
    description: entry.desc,
    developer: entry.developer,
    publisher: entry.publisher,
    releaseDate: entry.releaseDate?.toISOString(),
    genre: entry.genre ? [entry.genre] : undefined,
  })
  const userData = stripUndefined({
    lastPlayed: entry.lastPlayed,
    playtime: entry.playtimeSeconds,
    favorite: entry.favorite,
  })

  const record: GameRecord = { id, system: systemName, contentPath }
  if (Object.keys(metadata).length > 0) {
    Object.assign(record, { metadata })
  }
  if (Object.keys(userData).length > 0) {
    Object.assign(record, { userData })
  }
  return record
}

/**
 * Resolve the `<command>` template into a structured `LaunchSpec`.
 *
 * Steps:
 *   1. Substitute non-ROM placeholders (`%SYSTEM%`, `%CORE%`, `%EMULATOR%`,
 *      `%CONTROLLERSCONFIG%`). All four substitute to whitespace-free
 *      values — `%CONTROLLERSCONFIG%` substitutes to empty string for MVP.
 *   2. Whitespace-split the resulting string. ROM is still a `%ROM%` token,
 *      so the rom path's spaces don't break the split.
 *   3. Replace the `%ROM%` token with the actual rom path.
 *   4. Drop any token whose substituted value is `--controllers=""` — per
 *      plan decision, controllers config is omitted from MVP argv.
 *   5. First token = `command`; the rest = `args`.
 *
 * If `launchCommandOverride` is set, it replaces the first token (the
 * binary path) regardless of what `<command>` declares. Used by tests to
 * redirect launches at `tools/testing/fake-game.sh`.
 */
function composeFallbackLaunchSpec(args: {
  launchCommandOverride: string | undefined
  romPath: string
}): LaunchSpec {
  if (args.launchCommandOverride) {
    return { command: args.launchCommandOverride, args: [args.romPath] }
  }

  if (args.romPath.endsWith(".sh")) {
    return { command: args.romPath, args: [] }
  }

  return { command: "false", args: [] }
}

function composeLaunchSpec(args: {
  template: string
  launchCommandOverride: string | undefined
  romPath: string
  systemName: string
  coreName: string | undefined
  emulatorName: string | undefined
}): LaunchSpec {
  const substituted = args.template
    .replaceAll("%SYSTEM%", args.systemName)
    .replaceAll("%CORE%", args.coreName ?? "")
    .replaceAll("%EMULATOR%", args.emulatorName ?? "")
    .replaceAll("%CONTROLLERSCONFIG%", "")

  const tokens = substituted.split(/\s+/).filter(t => t.length > 0)
  // Drop the controllers token if present — per plan decision, omitted from
  // MVP argv. Two shapes seen in the wild: `--controllers=""` and
  // `--controllers=`. Both start with `--controllers=`.
  const filtered = tokens.filter(t => !t.startsWith("--controllers="))

  // Replace %ROM% token with the actual rom path. There must be exactly one
  // %ROM% in a well-formed ROCKNIX template.
  const final = filtered.map(t => (t === "%ROM%" ? args.romPath : t))

  const [first, ...rest] = final
  const command = args.launchCommandOverride ?? first ?? ""

  return { command, args: rest }
}

function compareByLastPlayedDesc(a: GameRecord, b: GameRecord): number {
  const ta = a.userData?.lastPlayed
  const tb = b.userData?.lastPlayed
  const tt = (x: typeof ta) =>
    x instanceof Date
      ? x.getTime()
      : typeof x === "string"
        ? Date.parse(x)
        : undefined
  const an = tt(ta)
  const bn = tt(tb)
  if (an === undefined && bn === undefined) return 0
  if (an === undefined) return 1
  if (bn === undefined) return -1
  return bn - an
}

function stripUndefined<T extends Record<string, unknown>>(
  input: T,
): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v
  }
  return out as Partial<T>
}
