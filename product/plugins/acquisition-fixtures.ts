import { AcquisitionError } from "@platform/acquisition/errors"
import type { PluginConfigContributions, ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"

interface FixtureEntry {
  readonly providerId: string
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
  readonly providerId: string
  readonly displayName: string
  readonly legalRisk: "low" | "medium" | "high"
  readonly credentialRequired?: boolean
  readonly entries: readonly FixtureEntry[]
  readonly parseCandidateUrl: (url: string) => string | null
  readonly unsupportedDownloadReason?: "unsupported" | "requires-user-action"
  readonly unknownDetailsMessage?: string
  readonly unknownDownloadMessage?: (id: string) => string
  readonly name?: string
  readonly config?: Omit<PluginConfigContributions, "providers">
}

function fixtureAcquisitionPlugin({
  providerId,
  displayName,
  legalRisk,
  credentialRequired = false,
  entries,
  parseCandidateUrl,
  unsupportedDownloadReason = "unsupported",
  unknownDetailsMessage,
  unknownDownloadMessage = id => unknownMessage(providerId, id),
  name = providerId.split(":")[1] ?? providerId,
  config = {},
}: FixturePluginOptions) {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const byAlias = new Map(
    entries.flatMap(entry =>
      [entry.id, ...(entry.aliases ?? [])].map(
        alias => [alias, entry] as const,
      ),
    ),
  )

  const findEntry = (id: string) => byAlias.get(id) ?? byId.get(id)

  return plugin({
    namespace: "@korri",
    name,
    title: displayName,
    contributes: {
      config: {
        ...config,
        providers: {
          [providerId]: {
            legalRisk,
            credentialRequired,
            enabledByDefault: false,
          },
        },
      },
      handlers: [
        {
          id: `${name}.claims-search`,
          operation: "claims.search",
          capabilities: ["claims.search", name],
          run: context => {
            const input = readRecord(context.input)
            const query = typeof input.query === "string" ? input.query : ""
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (platform): platform is string =>
                    typeof platform === "string",
                )
              : undefined
            return entries
              .filter(entry => matchesEntry(entry, query, platforms))
              .map(entry => candidateFor(entry, context.provider))
          },
        },
        {
          id: `${name}.claims-details`,
          operation: "claims.details",
          capabilities: ["claims.details", name],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            const entry = findEntry(id)
            if (!entry) {
              return unknownEntry(
                context.provider,
                id,
                unknownDetailsMessage ?? unknownMessage(context.provider, id),
              )
            }
            return detailsFor(entry, context.provider)
          },
        },
        {
          id: `${name}.claims-parse-url`,
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", name],
          run: context => {
            const input = readRecord(context.input)
            return typeof input.url === "string"
              ? parseCandidateUrl(input.url)
              : null
          },
        },
        {
          id: `${name}.provider-validate`,
          operation: "provider.validate",
          capabilities: ["provider.validate", name],
          run: context => {
            const input = readRecord(context.input)
            return {
              _tag: "HealthyProvider" as const,
              providerId: context.provider,
              checkedAt:
                typeof input.checkedAt === "string"
                  ? input.checkedAt
                  : new Date(0).toISOString(),
            }
          },
        },
        {
          id: `${name}.artifact-resolve-download`,
          operation: "artifact.resolve-download",
          capabilities: ["artifact.resolve-download", name],
          run: context => {
            const input = readRecord(context.input)
            const candidateUrl = stringField(input, "candidateUrl")
            const id = parseCandidateUrl(candidateUrl)
            if (!id) {
              return {
                _tag: "NonFinalDownload" as const,
                providerId: context.provider,
                reason: unsupportedDownloadReason,
                url: candidateUrl,
              } satisfies DownloadResolution
            }

            const entry = findEntry(id)
            if (!entry && entries.length === 0) {
              return {
                _tag: "NonFinalDownload" as const,
                providerId: context.provider,
                reason: unsupportedDownloadReason,
                url: candidateUrl,
              } satisfies DownloadResolution
            }
            if (!entry) {
              return {
                _tag: "FailedDownload" as const,
                providerId: context.provider,
                reason: "not-found" as const,
                message: unknownDownloadMessage(id),
              } satisfies DownloadResolution
            }

            if (entry.disabledMessage) {
              return {
                _tag: "FailedDownload" as const,
                providerId: context.provider,
                reason: "not-found" as const,
                message: entry.disabledMessage,
              } satisfies DownloadResolution
            }

            if (!entry.downloadUrl) {
              return {
                _tag: "NonFinalDownload" as const,
                providerId: context.provider,
                reason: unsupportedDownloadReason,
                url: candidateUrl,
              } satisfies DownloadResolution
            }

            return {
              _tag: "FinalDownload" as const,
              providerId: context.provider,
              url: entry.downloadUrl,
              ...(entry.filename ? { filename: entry.filename } : {}),
              ...(entry.contentType ? { contentType: entry.contentType } : {}),
            } satisfies DownloadResolution
          },
        },
        {
          id: `${name}.diagnostics`,
          operation: "diagnostics.collect",
          capabilities: [name],
          run: context => ({ provider: context.provider, status: "ok" }),
        },
      ],
    },
  })
}

function candidateFor(
  entry: FixtureEntry,
  providerId: ProviderId,
): ProviderClaim {
  return {
    _tag: "ProviderClaim",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    platform: entry.platform,
    playable: playableFor(entry, providerId),
  }
}

function detailsFor(
  entry: FixtureEntry,
  providerId: ProviderId,
): ProviderClaimDetails {
  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.downloadUrl ? { downloadPageUrl: entry.downloadUrl } : {}),
    playable: playableFor(entry, providerId),
  }
}

function playableFor(entry: FixtureEntry, providerId: ProviderId) {
  return {
    id: localPlayableId(entry.id),
    title: entry.title,
    providerId,
    releases: [
      {
        id: localPlayableId(entry.platform),
        providerId,
        system: entry.platform,
        ...(entry.downloadUrl ? { target: { kind: "url" as const, value: entry.downloadUrl } } : {}),
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
  providerId: ProviderId,
  id: string,
  message = unknownMessage(providerId, id),
): Effect.Effect<never, AcquisitionError> {
  return Effect.fail(
    new AcquisitionError({
      reason: "caller",
      providerId,
      message,
    }),
  )
}

function unknownMessage(providerId: string, id: string) {
  return `Unknown ${providerId} candidate: ${id}`
}

function readRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Readonly<Record<string, unknown>>
  }
  return {}
}

function stringField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = input[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`)
  }
  return value
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

const CHIP8_GALLERY_BASE = "https://johnearnest.github.io/chip8Archive"
const CHIP8_RAW_BASE =
  "https://raw.githubusercontent.com/JohnEarnest/chip8Archive/master"

function chip8PlayUrl(slug: string): string {
  return `${CHIP8_GALLERY_BASE}/play.html?p=${encodeURIComponent(slug)}`
}

function chip8RomUrl(slug: string): string {
  return `${CHIP8_RAW_BASE}/roms/${encodeURIComponent(slug)}.ch8`
}

function parseChip8ArchiveUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  if (
    url.hostname === "johnearnest.github.io" &&
    url.pathname === "/chip8Archive/play.html"
  ) {
    return url.searchParams.get("p")
  }
  if (url.hostname !== "raw.githubusercontent.com") return null
  const match = url.pathname.match(
    /^\/JohnEarnest\/chip8Archive\/master\/roms\/([^/]+)\.ch8$/,
  )
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

const chip8ArchiveEntries = [
  {
    providerId: "@korri:chip8archive",
    id: "octojam1title",
    title: "Octojam 1 Title",
    url: chip8PlayUrl("octojam1title"),
    platform: "chip8",
    description: "Greeting program for the Octo-ber 2014 Chip8 Game Jam.",
    downloadUrl: chip8RomUrl("octojam1title"),
    filename: "octojam1title.ch8",
    contentType: "application/octet-stream",
    searchText:
      "octojam1title octojam 1 title johnearnest octojam1 2014-09-29 chip8",
  },
  {
    providerId: "@korri:chip8archive",
    id: "wonkypong",
    title: "Wonky Pong",
    url: chip8PlayUrl("wonkypong"),
    platform: "xochip",
    description: "Pong, but wonky. Made for Octojam IV.",
    downloadUrl: chip8RomUrl("wonkypong"),
    filename: "wonkypong.ch8",
    contentType: "application/octet-stream",
    searchText: "wonkypong wonky pong tomrintjema octojam4 2018-11-01 xochip",
  },
  {
    providerId: "@korri:chip8archive",
    id: "octopeg",
    title: "Octopeg",
    url: chip8PlayUrl("octopeg"),
    platform: "schip",
    description: "Peggle clone for Superchip",
    downloadUrl: chip8RomUrl("octopeg"),
    filename: "octopeg.ch8",
    contentType: "application/octet-stream",
    searchText:
      "octopeg chromatophore peggle superchip octojam2 2015-10-29 schip",
  },
] as const satisfies readonly FixtureEntry[]

const homebrewHubEntries = [
  {
    providerId: "@korri:homebrewhub",
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
    providerId: "@korri:homebrewhub",
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
    providerId: "@korri:homebrewhub",
    id: "disabled-downloads",
    title: "Disabled Downloads",
    url: "https://hh3.gbdev.io/api/entry/disabled-downloads.json",
    platform: "nintendo-gameboy",
    description: "Homebrew Hub fixture with disabled downloads.",
    disabledMessage: "Homebrew Hub entry has disabled downloads",
    searchText: "disabled downloads homebrewhub nintendo-gameboy",
  },
] as const satisfies readonly FixtureEntry[]

const puzzleScriptEntries = [
  {
    providerId: "@korri:puzzlescript",
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
    providerId: "@korri:puzzlescript",
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
    providerId: "@korri:retrobrews",
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
    providerId: "@korri:retrobrews",
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
    providerId: "@korri:tic80gallery",
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
    providerId: "@korri:tic80gallery",
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
    providerId: "@korri:tic80gallery",
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
    providerId: "@korri:wasm4gallery",
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
    providerId: "@korri:wasm4gallery",
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
    providerId: "@korri:wasm4gallery",
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

export const chip8ArchiveFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:chip8archive",
  displayName: "CHIP-8 Archive",
  legalRisk: "low",
  entries: chip8ArchiveEntries,
  parseCandidateUrl: parseChip8ArchiveUrl,
  unknownDetailsMessage: "Unknown CHIP-8 Archive candidate.",
  unknownDownloadMessage: id => `Unknown CHIP-8 Archive candidate: ${id}`,
})

export const homebrewHubFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:homebrewhub",
  displayName: "Homebrew Hub",
  legalRisk: "low",
  entries: homebrewHubEntries,
  parseCandidateUrl: parseHomebrewHubUrl,
})

export const itchioFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:itchio",
  displayName: "itch.io",
  legalRisk: "medium",
  credentialRequired: true,
  entries: [],
  parseCandidateUrl: parseItchioUrl,
  unsupportedDownloadReason: "requires-user-action",
})

export const puzzleScriptFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:puzzlescript",
  displayName: "PuzzleScript",
  legalRisk: "low",
  entries: puzzleScriptEntries,
  parseCandidateUrl: parsePuzzleScriptUrl,
})

export const retrobrewsFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:retrobrews",
  displayName: "RetroBrews",
  legalRisk: "low",
  entries: retrobrewsEntries,
  parseCandidateUrl: parseRetrobrewsUrl,
})

export const tic80GalleryFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:tic80gallery",
  displayName: "TIC-80 Gallery",
  legalRisk: "low",
  entries: tic80Entries,
  parseCandidateUrl: parseTic80GalleryUrl,
})

export const wasm4GalleryFixturePlugin = fixtureAcquisitionPlugin({
  providerId: "@korri:wasm4gallery",
  displayName: "WASM-4 Gallery",
  legalRisk: "low",
  entries: wasm4Entries,
  parseCandidateUrl: parseWasm4GalleryUrl,
})

export const fixtureAcquisitionPlugins = [
  chip8ArchiveFixturePlugin,
  homebrewHubFixturePlugin,
  puzzleScriptFixturePlugin,
  retrobrewsFixturePlugin,
  tic80GalleryFixturePlugin,
  wasm4GalleryFixturePlugin,
] as const
