import type {
  SourceCandidate,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"
import { AcquisitionError } from "../errors"
import type { AcquisitionPluginDefinition } from "./registry"

interface FixtureEntry {
  readonly sourceName: string
  readonly id: string
  readonly title: string
  readonly url: string
  readonly platform: string
  readonly description?: string
  readonly downloadUrl?: string
  readonly filename?: string
  readonly contentType?: string
  readonly searchText: string
  readonly disabledMessage?: string
  readonly aliases?: readonly string[]
}

interface FixturePluginOptions {
  readonly sourceName: string
  readonly displayName: string
  readonly legalRisk: "low" | "medium" | "high"
  readonly credentialRequired?: boolean
  readonly entries: readonly FixtureEntry[]
  readonly parseCandidateUrl: (url: string) => string | null
  readonly unsupportedDownloadReason?: "unsupported" | "requires-user-action"
}

function fixturePluginDefinition({
  sourceName,
  displayName,
  legalRisk,
  credentialRequired = false,
  entries,
  parseCandidateUrl,
  unsupportedDownloadReason = "unsupported",
}: FixturePluginOptions): AcquisitionPluginDefinition {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const byAlias = new Map(
    entries.flatMap(entry =>
      [entry.id, ...(entry.aliases ?? [])].map(
        alias => [alias, entry] as const,
      ),
    ),
  )

  const findEntry = (id: string) => byAlias.get(id) ?? byId.get(id)

  return {
    metadata: {
      sourceName,
      displayName,
      module: "product/platform/acquisition/plugins/approved-fixtures",
      builtIn: true,
      enabledByDefault: true,
      legalRisk,
      credentialRequired,
    },
    parseCandidateUrl,
    search: (_context, request) =>
      Effect.succeed(
        entries
          .filter(entry =>
            matchesEntry(entry, request.query, request.platforms),
          )
          .map(candidateFor),
      ),
    details: (_context, request) => {
      const entry = findEntry(request.id)
      if (!entry) return unknownEntry(sourceName, request.id)
      return Effect.succeed(detailsFor(entry))
    },
    validateSource: context =>
      Effect.succeed({
        _tag: "HealthySource" as const,
        sourceName,
        checkedAt: context.checkedAt,
      }),
    resolveDownload: (_context, request) => {
      const id = parseCandidateUrl(request.candidateUrl)
      if (!id) {
        return Effect.succeed({
          _tag: "NonFinalDownload" as const,
          sourceName,
          reason: unsupportedDownloadReason,
          url: request.candidateUrl,
        } satisfies DownloadResolution)
      }

      const entry = findEntry(id)
      if (!entry && entries.length === 0) {
        return Effect.succeed({
          _tag: "NonFinalDownload" as const,
          sourceName,
          reason: unsupportedDownloadReason,
          url: request.candidateUrl,
        } satisfies DownloadResolution)
      }
      if (!entry) {
        return Effect.succeed({
          _tag: "FailedDownload" as const,
          sourceName,
          reason: "not-found" as const,
          message: unknownMessage(sourceName, id),
        } satisfies DownloadResolution)
      }

      if (entry.disabledMessage) {
        return Effect.succeed({
          _tag: "FailedDownload" as const,
          sourceName,
          reason: "not-found" as const,
          message: entry.disabledMessage,
        } satisfies DownloadResolution)
      }

      if (!entry.downloadUrl) {
        return Effect.succeed({
          _tag: "NonFinalDownload" as const,
          sourceName,
          reason: unsupportedDownloadReason,
          url: request.candidateUrl,
        } satisfies DownloadResolution)
      }

      return Effect.succeed({
        _tag: "FinalDownload" as const,
        sourceName,
        url: entry.downloadUrl,
        ...(entry.filename ? { filename: entry.filename } : {}),
        ...(entry.contentType ? { contentType: entry.contentType } : {}),
      } satisfies DownloadResolution)
    },
  }
}

function candidateFor(entry: FixtureEntry): SourceCandidate {
  return {
    _tag: "SourceCandidate",
    sourceName: entry.sourceName,
    id: entry.id,
    title: entry.title,
    url: entry.url,
    platform: entry.platform,
    playable: playableFor(entry),
  }
}

function detailsFor(entry: FixtureEntry): SourceDetails {
  return {
    _tag: "SourceDetails",
    sourceName: entry.sourceName,
    id: entry.id,
    title: entry.title,
    url: entry.url,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.downloadUrl ? { downloadPageUrl: entry.downloadUrl } : {}),
    playable: playableFor(entry),
  }
}

function playableFor(entry: FixtureEntry) {
  return {
    id: localPlayableId(entry.id),
    title: entry.title,
    source: entry.sourceName,
    releases: [
      {
        id: localPlayableId(entry.platform),
        source: entry.sourceName,
        system: entry.platform,
        ...(entry.downloadUrl ? { target: entry.downloadUrl } : {}),
      },
    ],
  }
}

function localPlayableId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
  return sanitized.length > 0 ? sanitized : "candidate"
}

function matchesEntry(
  entry: FixtureEntry,
  query: string,
  platforms?: readonly string[],
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) return false
  if (
    platforms &&
    platforms.length > 0 &&
    !platforms.includes(entry.platform)
  ) {
    return false
  }
  return entry.searchText.toLowerCase().includes(normalizedQuery)
}

function unknownEntry(
  sourceName: string,
  id: string,
): Effect.Effect<never, AcquisitionError> {
  return Effect.fail(
    new AcquisitionError({
      reason: "caller",
      sourceName,
      message: unknownMessage(sourceName, id),
    }),
  )
}

function unknownMessage(sourceName: string, id: string) {
  return `Unknown ${sourceName} candidate: ${id}`
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function decodeSegment(value: string | undefined) {
  return value ? decodeURIComponent(value) : null
}

function parseHomebrewHubUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url || url.hostname !== "hh3.gbdev.io") return null
  const entry = url.pathname.match(/^\/api\/entry\/([^/]+)\.json$/)
  if (entry?.[1]) return decodeURIComponent(entry[1])
  const asset = url.pathname.match(/^\/static\/[^/]+\/entries\/([^/]+)\/.+$/)
  return decodeSegment(asset?.[1])
}

function parseItchioUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url || !url.hostname.endsWith(".itch.io")) return null
  const creator = url.hostname.replace(/\.itch\.io$/, "")
  const slug = url.pathname.split("/").filter(Boolean)[0]
  return creator && slug ? `${creator}/${slug}` : null
}

function parsePico8BbsUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url || url.hostname !== "www.lexaloffle.com") return null
  if (url.pathname !== "/bbs/") return null
  return url.searchParams.get("tid")
}

function parsePortmasterUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  if (url.hostname === "portmaster.games" && url.pathname === "/detail.html") {
    return normalizePortmasterId(url.searchParams.get("name"))
  }
  const release = url.pathname.match(
    /^\/PortsMaster\/PortMaster-Games\/releases\/download\/[^/]+\/([^/]+\.zip)$/,
  )
  if (url.hostname === "github.com" && release?.[1]) {
    return normalizePortmasterId(decodeURIComponent(release[1]))
  }
  return null
}

function normalizePortmasterId(id: string | null | undefined) {
  if (!id) return null
  return id.endsWith(".zip") ? id : `${id}.zip`
}

function parsePuzzleScriptUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  if (url.hostname === "www.puzzlescript.net") {
    return url.searchParams.get("p") ?? url.searchParams.get("hack")
  }
  if (url.hostname === "gist.github.com") {
    const parts = url.pathname.split("/").filter(Boolean)
    return parts.at(-1) ?? null
  }
  if (url.hostname === "gist.githubusercontent.com") {
    const parts = url.pathname.split("/").filter(Boolean)
    return parts.length >= 2 ? (parts[1] ?? null) : null
  }
  return null
}

function parseRetrobrewsUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  if (url.hostname === "github.com") return parseRetrobrewsGitHubPath(url)
  if (url.hostname === "raw.githubusercontent.com") {
    return parseRetrobrewsRawPath(url)
  }
  return null
}

function parseRetrobrewsGitHubPath(url: URL): string | null {
  return retrobrewsIdFromMatch(
    url.pathname.match(/^\/retrobrews\/([^/]+)\/blob\/master\/(.+)$/),
  )
}

function parseRetrobrewsRawPath(url: URL): string | null {
  return retrobrewsIdFromMatch(
    url.pathname.match(/^\/retrobrews\/([^/]+)\/master\/(.+)$/),
  )
}

function retrobrewsIdFromMatch(match: RegExpMatchArray | null): string | null {
  const repo = match?.[1]
  const path = match?.[2]
  if (!repo || !path || path.includes("..")) return null
  return `${decodeURIComponent(repo)}:${decodeURIComponent(path)}`
}

function parseTic80GalleryUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url || url.hostname !== "tic80.com") return null
  if (url.pathname === "/play") return url.searchParams.get("cart")
  const cart = url.pathname.match(/^\/cart\/([^/]+)\/([^/]+\.tic)$/)
  if (!cart?.[1]) return null
  return TIC80_HASH_TO_ID[cart[1]] ?? null
}

function parseWasm4GalleryUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url || url.hostname !== "wasm4.org") return null
  const play = url.pathname.match(/^\/play\/([^/]+)$/)
  if (play?.[1]) return decodeURIComponent(play[1])
  const cart = url.pathname.match(/^\/carts\/([^/]+)\.wasm$/)
  return decodeSegment(cart?.[1])
}

const homebrewHubEntries = [
  {
    sourceName: "homebrewhub",
    id: "2048gb",
    title: "2048gb",
    url: "https://hh3.gbdev.io/api/entry/2048gb.json",
    platform: "nintendo-gameboy",
    description: "A Game Boy port of 2048 by Sanqui.",
    downloadUrl:
      "https://hh3.gbdev.io/static/database-gb/entries/2048gb/2048.gb",
    filename: "2048.gb",
    contentType: "application/octet-stream",
    searchText: "2048gb 2048 sanqui nintendo-gameboy zlib",
  },
  {
    sourceName: "homebrewhub",
    id: "basil-termini_2048-advance",
    title: "2048 Advance",
    url: "https://hh3.gbdev.io/api/entry/basil-termini_2048-advance.json",
    platform: "nintendo-gameboy-advance",
    description: "A Game Boy Advance 2048 implementation by Basil Termini.",
    downloadUrl:
      "https://hh3.gbdev.io/static/database-gba/entries/basil-termini_2048-advance/files/2048%20jam.gba",
    filename: "2048 jam.gba",
    contentType: "application/octet-stream",
    searchText:
      "2048 advance basil termini nintendo-gameboy-advance mit cc-by-4.0",
  },
  {
    sourceName: "homebrewhub",
    id: "disabled-downloads",
    title: "Disabled Downloads",
    url: "https://hh3.gbdev.io/api/entry/disabled-downloads.json",
    platform: "nintendo-gameboy",
    description: "Homebrew Hub fixture with disabled downloads.",
    disabledMessage: "Homebrew Hub entry has disabled downloads",
    searchText: "disabled downloads homebrewhub nintendo-gameboy",
  },
] as const satisfies readonly FixtureEntry[]

const pico8Entries = [
  {
    sourceName: "pico8bbs",
    id: "101",
    title: "Celeste Classic",
    url: "https://www.lexaloffle.com/bbs/?tid=101",
    platform: "pico8",
    description: "A tiny platformer from the PICO-8 BBS by Maddy Thorson.",
    downloadUrl:
      "https://www.lexaloffle.com/bbs/cposts/1/celeste-classic.p8.png",
    filename: "celeste-classic.p8.png",
    contentType: "image/png",
    searchText:
      "101 celeste classic maddy thorson pico8 p8.png cc-by-nc-sa-4.0",
  },
  {
    sourceName: "pico8bbs",
    id: "105",
    title: "No Cart Thread",
    url: "https://www.lexaloffle.com/bbs/?tid=105",
    platform: "pico8",
    disabledMessage: "PICO-8 BBS thread has no downloadable cart",
    searchText: "105 no cart thread pico8",
  },
] as const satisfies readonly FixtureEntry[]

const portmasterEntries = [
  {
    sourceName: "portmaster",
    id: "2048.zip",
    aliases: ["2048"],
    title: "2048",
    url: "https://portmaster.games/detail.html?name=2048",
    platform: "linux-port",
    description: "Ready-to-run PortMaster package for 2048.",
    downloadUrl:
      "https://github.com/PortsMaster/PortMaster-Games/releases/download/2026-04-12_1606/2048.zip",
    filename: "2048.zip",
    contentType: "application/zip",
    searchText: "2048 christian haitian portmaster linux-port zip ready-to-run",
  },
  {
    sourceName: "portmaster",
    id: "akeyspath.zip",
    aliases: ["akeyspath"],
    title: "A Key(s) Path",
    url: "https://portmaster.games/detail.html?name=akeyspath",
    platform: "linux-port",
    description: "A puzzle platformer port by tabreturn.",
    downloadUrl:
      "https://github.com/PortsMaster/PortMaster-Games/releases/download/2025-06-24_0854/akeyspath.zip",
    filename: "akeyspath.zip",
    contentType: "application/zip",
    searchText:
      "a key keys path tabreturn puzzle platformer portmaster linux-port zip",
  },
  {
    sourceName: "portmaster",
    id: "absolutereflex.zip",
    aliases: ["absolutereflex"],
    title: "Absolute Reflex",
    url: "https://portmaster.games/detail.html?name=absolutereflex",
    platform: "linux-port",
    description: "PortMaster fixture that is not ready-to-run.",
    disabledMessage: "PortMaster entry is not ready-to-run",
    searchText: "absolute reflex not ready-to-run linux-port",
  },
] as const satisfies readonly FixtureEntry[]

const puzzleScriptEntries = [
  {
    sourceName: "puzzlescript",
    id: "6994394",
    title: "Atlas Shrank",
    url: "https://www.puzzlescript.net/play.html?p=6994394",
    platform: "puzzlescript",
    description: "PuzzleScript gallery game by James Noeckel.",
    downloadUrl:
      "https://gist.githubusercontent.com/anonymous/6994394/raw/e2ca4d17e93996a1e5ba576c29bdd9746cad1d1e/script.txt",
    filename: "atlas-shrank.pz",
    contentType: "text/plain",
    searchText:
      "atlas shrank james noeckel puzzlescript 6994394 freeware gallery attested",
  },
  {
    sourceName: "puzzlescript",
    id: "fcf4b43ee6c679ef9389",
    title: "Cake Monsters",
    url: "https://www.puzzlescript.net/play.html?p=fcf4b43ee6c679ef9389",
    platform: "puzzlescript",
    description: "PuzzleScript gallery game by Matt Rix.",
    downloadUrl:
      "https://gist.githubusercontent.com/anonymous/fcf4b43ee6c679ef9389/raw/script.txt",
    filename: "cake-monsters.pz",
    contentType: "text/plain",
    searchText:
      "cake monsters matt rix magicule puzzlescript fcf4b43ee6c679ef9389",
  },
] as const satisfies readonly FixtureEntry[]

const retrobrewsEntries = [
  {
    sourceName: "retrobrews",
    id: "nes-games:ambushed.nes",
    title: "Ambushed",
    url: "https://github.com/retrobrews/nes-games/blob/master/ambushed.nes",
    platform: "nintendo-nes",
    description: "NES homebrew by SlyDog Studios.",
    downloadUrl:
      "https://raw.githubusercontent.com/retrobrews/nes-games/master/ambushed.nes",
    filename: "ambushed.nes",
    contentType: "application/octet-stream",
    searchText:
      "ambushed slydog studios homebrew rom arcade nintendo-nes nes-games ambushed.nes",
  },
  {
    sourceName: "retrobrews",
    id: "gba-games:anguna.gba",
    title: "Anguna",
    url: "https://github.com/retrobrews/gba-games/blob/master/anguna.gba",
    platform: "nintendo-gameboy-advance",
    description: "GBA homebrew by Nathan Tolbert.",
    downloadUrl:
      "https://raw.githubusercontent.com/retrobrews/gba-games/master/anguna.gba",
    filename: "anguna.gba",
    contentType: "application/octet-stream",
    searchText:
      "anguna nathan tolbert nintendo-gameboy-advance gba-games anguna.gba",
  },
] as const satisfies readonly FixtureEntry[]

const TIC80_HASH_TO_ID: Record<string, string> = {
  "68d5e7881289837510df0e8c080bea73": "395",
  "84d8c6a714233c6346a392f50fc1ae6b": "2979",
}

const tic80Entries = [
  {
    sourceName: "tic80gallery",
    id: "395",
    title: "2048 (TIC-80 Version)",
    url: "https://tic80.com/play?cart=395",
    platform: "tic80",
    description: "TIC-80 gallery cartridge in the Games category.",
    downloadUrl:
      "https://tic80.com/cart/68d5e7881289837510df0e8c080bea73/2048_tic_80_version.tic",
    filename: "2048_tic_80_version.tic",
    contentType: "application/octet-stream",
    searchText:
      "395 2048 tic-80 version games tic80 68d5e7881289837510df0e8c080bea73",
  },
  {
    sourceName: "tic80gallery",
    id: "2979",
    title: "Snake",
    url: "https://tic80.com/play?cart=2979",
    platform: "tic80",
    description: "TIC-80 gallery snake cartridge.",
    downloadUrl:
      "https://tic80.com/cart/84d8c6a714233c6346a392f50fc1ae6b/snake.tic",
    filename: "snake.tic",
    contentType: "application/octet-stream",
    searchText: "2979 snake tic80 games 84d8c6a714233c6346a392f50fc1ae6b",
  },
  {
    sourceName: "tic80gallery",
    id: "4676",
    title: "Ladders & Dragons",
    url: "https://tic80.com/play?cart=4676",
    platform: "tic80",
    description: "HTML-entity decoding fixture for TIC-80.",
    searchText: "4676 ladders & dragons tic80 games",
  },
] as const satisfies readonly FixtureEntry[]

const wasm4Entries = [
  {
    sourceName: "wasm4gallery",
    id: "snake",
    title: "Snake",
    url: "https://wasm4.org/play/snake",
    platform: "wasm4",
    description: "Classic snake & game by Tomas Tulka.",
    downloadUrl: "https://wasm4.org/carts/snake.wasm",
    filename: "snake.wasm",
    contentType: "application/wasm",
    searchText:
      "snake tomas tulka ttulka wasm4 classic snake & game cc-by-nc-sa-4.0",
  },
  {
    sourceName: "wasm4gallery",
    id: "watris",
    title: "Watris",
    url: "https://wasm4.org/play/watris",
    platform: "wasm4",
    description: "WASM-4 gallery game by Bruno Garcia.",
    downloadUrl: "https://wasm4.org/carts/watris.wasm",
    filename: "watris.wasm",
    contentType: "application/wasm",
    searchText: "watris bruno garcia aduros wasm4",
  },
  {
    sourceName: "wasm4gallery",
    id: "co-op-robots",
    title: "Co-op Robots",
    url: "https://wasm4.org/play/co-op-robots",
    platform: "wasm4",
    description: "Tiny arenas for Ada Builder and Grace Maker.",
    downloadUrl: "https://wasm4.org/carts/co-op-robots.wasm",
    filename: "co-op-robots.wasm",
    contentType: "application/wasm",
    searchText: "co-op robots tiny arenas ada builder grace maker wasm4",
  },
] as const satisfies readonly FixtureEntry[]

export const approvedFixturePluginDefinitions = [
  fixturePluginDefinition({
    sourceName: "homebrewhub",
    displayName: "Homebrew Hub",
    legalRisk: "low",
    entries: homebrewHubEntries,
    parseCandidateUrl: parseHomebrewHubUrl,
  }),
  fixturePluginDefinition({
    sourceName: "itchio",
    displayName: "itch.io",
    legalRisk: "medium",
    credentialRequired: true,
    entries: [],
    parseCandidateUrl: parseItchioUrl,
    unsupportedDownloadReason: "requires-user-action",
  }),
  fixturePluginDefinition({
    sourceName: "pico8bbs",
    displayName: "PICO-8 BBS",
    legalRisk: "medium",
    entries: pico8Entries,
    parseCandidateUrl: parsePico8BbsUrl,
  }),
  fixturePluginDefinition({
    sourceName: "portmaster",
    displayName: "PortMaster",
    legalRisk: "low",
    entries: portmasterEntries,
    parseCandidateUrl: parsePortmasterUrl,
  }),
  fixturePluginDefinition({
    sourceName: "puzzlescript",
    displayName: "PuzzleScript",
    legalRisk: "low",
    entries: puzzleScriptEntries,
    parseCandidateUrl: parsePuzzleScriptUrl,
  }),
  fixturePluginDefinition({
    sourceName: "retrobrews",
    displayName: "RetroBrews",
    legalRisk: "low",
    entries: retrobrewsEntries,
    parseCandidateUrl: parseRetrobrewsUrl,
  }),
  fixturePluginDefinition({
    sourceName: "tic80gallery",
    displayName: "TIC-80 Gallery",
    legalRisk: "low",
    entries: tic80Entries,
    parseCandidateUrl: parseTic80GalleryUrl,
  }),
  fixturePluginDefinition({
    sourceName: "wasm4gallery",
    displayName: "WASM-4 Gallery",
    legalRisk: "low",
    entries: wasm4Entries,
    parseCandidateUrl: parseWasm4GalleryUrl,
  }),
] as const satisfies readonly AcquisitionPluginDefinition[]
