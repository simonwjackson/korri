import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

/**
 * Writes a real ROCKNIX-style on-disk library into a tmpdir for tests.
 *
 * Used by RocknixSource tests, Effect layer tests, and RPC handler tests
 * that want to exercise the real filesystem reader against known-shape inputs.
 * No mocked `fs`, no mocked XML parser — everything below the helper is the
 * production code path.
 *
 * Output layout:
 *
 *   <tmpdir>/
 *   ├── es_systems.cfg
 *   └── roms/
 *       └── <system.name>/
 *           ├── gamelist.xml
 *           └── <game.path basename>     (empty placeholder for the ROM)
 *
 * The helper is intentionally fixture-writer-only for now. Once RocknixSource
 * lands (Unit 3 of docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md),
 * a thin convenience returning `{ source, cleanup }` can be layered on top by
 * importing `createRocknixSource` and constructing one against `rootDir` /
 * `esSystemsPath` / `launchCommand`. Until then, callers wire the source
 * themselves so this helper has no upward dependency on runtime code that
 * doesn't exist yet.
 *
 * See docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md.
 */

export type GameFixture = {
  /** ROM filename, written as relative `<path>./{path}</path>` in gamelist.xml. */
  path: string
  name?: string
  desc?: string
  developer?: string
  publisher?: string
  releasedate?: string
  genre?: readonly string[]
  /** ROCKNIX wire format: `YYYYMMDDTHHmmss` (no separators, UTC). */
  lastPlayed?: string
  playcount?: number
  gametime?: number
  favorite?: boolean
}

export type SystemFixture = {
  /** Folder name under the gamelist root; also `<system><name>` in es_systems.cfg. */
  name: string
  fullname?: string
  defaultEmulator: string
  defaultCore: string
  /** ROM extensions, space-joined into es_systems.cfg `<extension>`. Defaults to `[".rom"]`. */
  extension?: readonly string[]
  games: readonly GameFixture[]
}

export type WithTempLibraryOptions = {
  systems: readonly SystemFixture[]
  /**
   * Absolute (or repo-relative) path the eventual RocknixConfig.launchCommand
   * should point at. Defaults to the repo's tools/testing/fake-game.sh.
   *
   * Surfaced on the returned object so callers can pass it straight into
   * `createRocknixSource({ ..., launchCommand })` without re-deriving it.
   */
  launchCommand?: string
}

export type TempLibrary = {
  /** Absolute path to the gamelist root containing system folders. */
  rootDir: string
  /** Absolute path to the written es_systems.cfg. */
  esSystemsPath: string
  /** Resolved absolute path of the launch target. */
  launchCommand: string
  cleanup: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")
const DEFAULT_LAUNCH_COMMAND = join(
  REPO_ROOT,
  "tools",
  "testing",
  "fake-game.sh",
)

export async function withTempLibrary(
  options: WithTempLibraryOptions,
): Promise<TempLibrary> {
  const tempRoot = await mkdtemp(join(tmpdir(), "korri-temp-library-"))
  const rootDir = join(tempRoot, "roms")
  const esSystemsPath = join(tempRoot, "es_systems.cfg")
  const launchCommand = resolveLaunchCommand(options.launchCommand)

  let success = false
  try {
    await mkdir(rootDir, { recursive: true })

    for (const system of options.systems) {
      await writeSystem({ rootDir, system })
    }

    await writeFile(
      esSystemsPath,
      renderEsSystemsCfg({ rootDir, systems: options.systems, launchCommand }),
      "utf8",
    )
    success = true
  } finally {
    if (!success) {
      // Clean up partial state on construction failure so tests don't leak.
      await rm(tempRoot, { recursive: true, force: true })
    }
  }

  const cleanup = async () => {
    await rm(tempRoot, { recursive: true, force: true })
  }

  return {
    rootDir,
    esSystemsPath,
    launchCommand,
    cleanup,
    [Symbol.asyncDispose]: cleanup,
  }
}

function resolveLaunchCommand(input: string | undefined): string {
  if (!input) return DEFAULT_LAUNCH_COMMAND
  return resolve(input)
}

async function writeSystem(args: {
  rootDir: string
  system: SystemFixture
}): Promise<void> {
  const systemDir = join(args.rootDir, args.system.name)
  await mkdir(systemDir, { recursive: true })

  // Empty placeholder ROM files so launchers can spawn against real paths.
  for (const game of args.system.games) {
    await writeFile(join(systemDir, game.path), "", "utf8")
  }

  const gamelistPath = join(systemDir, "gamelist.xml")
  await writeFile(gamelistPath, renderGamelistXml(args.system.games), "utf8")
}

function renderEsSystemsCfg(args: {
  rootDir: string
  systems: readonly SystemFixture[]
  launchCommand: string
}): string {
  const systems = args.systems
    .map(system => {
      const ext = (system.extension ?? [".rom"]).join(" ")
      const fullname = system.fullname ?? system.name
      const systemPath = join(args.rootDir, system.name)
      // Match the real ROCKNIX command template shape probed live from the
      // live ROCKNIX device: placeholders for ROM/SYSTEM/CORE/EMULATOR plus a
      // `--controllers="%CONTROLLERSCONFIG%"` token. Defaults are sourced
      // from the nested <emulators> block below, not baked into the
      // template.
      const command = `${args.launchCommand} %ROM% -P%SYSTEM% --core=%CORE% --emulator=%EMULATOR% --controllers="%CONTROLLERSCONFIG%"`
      return [
        "  <system>",
        `    <name>${escapeXml(system.name)}</name>`,
        `    <fullname>${escapeXml(fullname)}</fullname>`,
        `    <path>${escapeXml(systemPath)}</path>`,
        `    <extension>${escapeXml(ext)}</extension>`,
        `    <command>${command}</command>`,
        `    <platform>${escapeXml(system.name)}</platform>`,
        `    <theme>${escapeXml(system.name)}</theme>`,
        "    <emulators>",
        `      <emulator name="${escapeXml(system.defaultEmulator)}">`,
        "        <cores>",
        `          <core default="true">${escapeXml(system.defaultCore)}</core>`,
        "        </cores>",
        "      </emulator>",
        "    </emulators>",
        "  </system>",
      ].join("\n")
    })
    .join("\n")

  return `<?xml version="1.0"?>
<systemList>
${systems}
</systemList>
`
}

function renderGamelistXml(games: readonly GameFixture[]): string {
  const entries = games
    .map(game => {
      const lines: string[] = []
      lines.push("  <game>")
      lines.push(`    <path>./${escapeXml(game.path)}</path>`)
      if (game.name !== undefined)
        lines.push(`    <name>${escapeXml(game.name)}</name>`)
      if (game.desc !== undefined)
        lines.push(`    <desc>${escapeXml(game.desc)}</desc>`)
      if (game.developer !== undefined)
        lines.push(`    <developer>${escapeXml(game.developer)}</developer>`)
      if (game.publisher !== undefined)
        lines.push(`    <publisher>${escapeXml(game.publisher)}</publisher>`)
      if (game.releasedate !== undefined)
        lines.push(
          `    <releasedate>${escapeXml(game.releasedate)}</releasedate>`,
        )
      if (game.genre !== undefined)
        lines.push(`    <genre>${escapeXml(game.genre.join(", "))}</genre>`)
      if (game.lastPlayed !== undefined)
        lines.push(`    <lastplayed>${escapeXml(game.lastPlayed)}</lastplayed>`)
      if (game.playcount !== undefined)
        lines.push(`    <playcount>${game.playcount}</playcount>`)
      if (game.gametime !== undefined)
        lines.push(`    <gametime>${game.gametime}</gametime>`)
      if (game.favorite !== undefined)
        lines.push(
          `    <favorite>${game.favorite ? "true" : "false"}</favorite>`,
        )
      lines.push("  </game>")
      return lines.join("\n")
    })
    .join("\n")

  return `<?xml version="1.0"?>
<gameList>
${entries}
</gameList>
`
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
