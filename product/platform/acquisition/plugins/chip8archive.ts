import type { SourceDetails } from "@platform/protocol/acquisition/candidate"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"
import { AcquisitionError } from "../errors"
import type { AcquisitionPluginDefinition } from "./registry"

const SOURCE_NAME = "chip8archive"
const DISPLAY_NAME = "CHIP-8 Archive"
const GALLERY_BASE = "https://johnearnest.github.io/chip8Archive"
const RAW_BASE =
  "https://raw.githubusercontent.com/JohnEarnest/chip8Archive/master"

interface Chip8Program {
  readonly title: string
  readonly authors: readonly string[]
  readonly images: readonly string[]
  readonly desc?: string
  readonly event?: string
  readonly release?: string
  readonly platform?: string
}

const PROGRAMS: Record<string, Chip8Program> = {
  octojam1title: {
    title: "Octojam 1 Title",
    authors: ["JohnEarnest"],
    images: ["octojam1title.gif"],
    desc: "Greeting program for the Octo-ber 2014 Chip8 Game Jam.",
    event: "Octojam1",
    release: "2014-09-29",
    platform: "chip8",
  },
  wonkypong: {
    title: "Wonky Pong",
    authors: ["TomRintjema"],
    images: ["wonkypong.gif"],
    desc: "Pong, but wonky. Made for Octojam IV.",
    event: "Octojam4",
    release: "2018-11-01",
    platform: "xochip",
  },
  octopeg: {
    title: "Octopeg",
    authors: ["Chromatophore"],
    images: ["octopeg.gif"],
    desc: "Peggle clone for Superchip",
    event: "Octojam2",
    release: "2015-10-29",
    platform: "schip",
  },
}

function playUrl(slug: string): string {
  return `${GALLERY_BASE}/play.html?p=${encodeURIComponent(slug)}`
}

function romUrl(slug: string): string {
  return `${RAW_BASE}/roms/${encodeURIComponent(slug)}.ch8`
}

function candidateFor(slug: string, program: Chip8Program) {
  return {
    _tag: "SourceCandidate" as const,
    sourceName: SOURCE_NAME,
    id: slug,
    title: program.title,
    url: playUrl(slug),
    platform: program.platform ?? "chip8",
  }
}

function detailsFor(slug: string, program: Chip8Program): SourceDetails {
  return {
    _tag: "SourceDetails" as const,
    sourceName: SOURCE_NAME,
    id: slug,
    title: program.title,
    url: playUrl(slug),
    ...(program.desc ? { description: program.desc } : {}),
    downloadPageUrl: romUrl(slug),
  }
}

function matchesProgram(slug: string, program: Chip8Program, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) return false
  return [
    slug,
    program.title,
    program.desc,
    program.event,
    program.release,
    program.platform,
    ...program.authors,
  ]
    .filter((value): value is string => value !== undefined)
    .join("\n")
    .toLowerCase()
    .includes(normalizedQuery)
}

export function parseChip8ArchiveCandidateUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  return knownSlug(slugFromGalleryUrl(url) ?? slugFromRawRomUrl(url))
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function slugFromGalleryUrl(url: URL): string | null {
  if (
    url.hostname !== "johnearnest.github.io" ||
    url.pathname !== "/chip8Archive/play.html"
  ) {
    return null
  }
  return url.searchParams.get("p")
}

function slugFromRawRomUrl(url: URL): string | null {
  if (url.hostname !== "raw.githubusercontent.com") return null
  const match = url.pathname.match(
    /^\/JohnEarnest\/chip8Archive\/master\/roms\/([^/]+)\.ch8$/,
  )
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function knownSlug(slug: string | null | undefined): string | null {
  return slug && PROGRAMS[slug] ? slug : null
}

function knownProgram(
  slug: string,
): Effect.Effect<Chip8Program, AcquisitionError> {
  const program = PROGRAMS[slug]
  if (program) return Effect.succeed(program)
  return Effect.fail(
    new AcquisitionError({
      reason: "caller",
      message: "Unknown CHIP-8 Archive candidate.",
      sourceName: SOURCE_NAME,
    }),
  )
}

export const chip8ArchivePluginDefinition = {
  metadata: {
    sourceName: SOURCE_NAME,
    displayName: DISPLAY_NAME,
    module: "product/platform/acquisition/plugins/chip8archive",
    builtIn: true,
    enabledByDefault: true,
    legalRisk: "low",
    credentialRequired: false,
  },
  parseCandidateUrl: parseChip8ArchiveCandidateUrl,
  search: (_context, request) =>
    Effect.succeed(
      Object.entries(PROGRAMS)
        .filter(([slug, program]) =>
          matchesProgram(slug, program, request.query),
        )
        .map(([slug, program]) => candidateFor(slug, program)),
    ),
  details: (_context, request) =>
    Effect.gen(function* () {
      const program = yield* knownProgram(request.id)
      return detailsFor(request.id, program)
    }),
  validateSource: context =>
    Effect.succeed({
      _tag: "HealthySource" as const,
      sourceName: SOURCE_NAME,
      checkedAt: context.checkedAt,
    }),
  resolveDownload: (_context, request) =>
    Effect.gen(function* () {
      const slug = parseChip8ArchiveCandidateUrl(request.candidateUrl)
      if (!slug) {
        return {
          _tag: "NonFinalDownload" as const,
          sourceName: SOURCE_NAME,
          reason: "unsupported" as const,
          url: request.candidateUrl,
        } satisfies DownloadResolution
      }
      yield* knownProgram(slug)
      return {
        _tag: "FinalDownload" as const,
        sourceName: SOURCE_NAME,
        url: romUrl(slug),
        filename: `${slug}.ch8`,
        contentType: "application/octet-stream",
      } satisfies DownloadResolution
    }),
} satisfies AcquisitionPluginDefinition
