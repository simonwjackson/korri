import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"

export const KORRI_PICO8_PLUGIN_ID = "@korri:pico8" as const

interface Pico8BbsEntry {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly platform: "pico8"
  readonly description?: string
  readonly downloadUrl?: string
  readonly filename?: string
  readonly contentType?: string
  readonly disabledMessage?: string
  readonly searchText: string
}

const pico8BbsEntries: readonly Pico8BbsEntry[] = [
  {
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
    id: "105",
    title: "No Cart Thread",
    url: "https://www.lexaloffle.com/bbs/?tid=105",
    platform: "pico8",
    disabledMessage: "PICO-8 BBS thread has no downloadable cart",
    searchText: "105 no cart thread pico8",
  },
]

const byId = new Map(pico8BbsEntries.map(entry => [entry.id, entry]))

export const pico8Plugin = plugin({
  namespace: "@korri",
  name: "pico8",
  title: "PICO-8",
  description:
    "Adds PICO-8 BBS acquisition provider claims, cart download resolution, and the fake-08 PICO-8 runtime package.",
  contributes: {
    config: {
      systems: {
        pico8: {
          id: "pico8",
          title: "PICO-8",
          launch: { app: "retroarch", module: "fake08" },
        },
      },
      modules: {
        "libretro-fake-08-package": {
          id: "libretro-fake-08-package",
          kind: "nix-package",
          package: "libretro-fake-08",
          path: "product/plugins/pico8/packages/libretro-fake-08",
          capabilities: ["package.expose", "launch.runtime", "pico8"],
          core: "fake08",
        },
        fake08: {
          id: "fake08",
          kind: "libretro-core",
          path: "/etc/korri/cores/fake08_libretro.so",
          package: "libretro-fake-08",
          capabilities: ["launch.module", "pico8"],
        },
      },
    },
    handlers: [
      {
        id: "pico8.claims-search",
        operation: "claims.search",
        capabilities: ["claims.search", "pico8"],
        run: context => {
          const input = readRecord(context.input)
          const query = typeof input.query === "string" ? input.query : ""
          const platforms = Array.isArray(input.platforms)
            ? input.platforms.filter(
                (platform): platform is string => typeof platform === "string",
              )
            : undefined
          return searchPico8Bbs(query, platforms).map(entry =>
            claimFor(context.provider, entry),
          )
        },
      },
      {
        id: "pico8.claims-details",
        operation: "claims.details",
        capabilities: ["claims.details", "pico8"],
        run: context => {
          const input = readRecord(context.input)
          const id = stringField(input, "id")
          const entry = byId.get(id)
          if (!entry) throw new Error(`Unknown PICO-8 BBS candidate: ${id}`)
          return detailsFor(context.provider, entry)
        },
      },
      {
        id: "pico8.claims-parse-url",
        operation: "claims.parse-url",
        capabilities: ["claims.parse-url", "pico8"],
        run: context => {
          const input = readRecord(context.input)
          const url = typeof input.url === "string" ? input.url : ""
          return parsePico8BbsUrl(url)
        },
      },
      {
        id: "pico8.provider-validate",
        operation: "provider.validate",
        capabilities: ["provider.validate", "pico8"],
        run: context => {
          const input = readRecord(context.input)
          return {
            _tag: "HealthyProvider" as const,
            providerId: context.provider,
            checkedAt:
              typeof input.checkedAt === "string"
                ? input.checkedAt
                : new Date(0).toISOString(),
          } satisfies ProviderHealth
        },
      },
      {
        id: "pico8.artifact-resolve-download",
        operation: "artifact.resolve-download",
        capabilities: ["artifact.resolve-download", "pico8"],
        run: context => {
          const input = readRecord(context.input)
          const candidateUrl = stringField(input, "candidateUrl")
          return resolvePico8BbsDownload(context.provider, candidateUrl)
        },
      },
      {
        id: "pico8.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["pico8"],
        run: context => ({
          provider: context.provider,
          status: "ok",
          indexedEntries: pico8BbsEntries.length,
        }),
      },
    ],
  },
})

function searchPico8Bbs(
  query: string,
  platforms?: readonly string[],
): readonly Pico8BbsEntry[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) return []
  return pico8BbsEntries.filter(entry => {
    if (
      platforms &&
      platforms.length > 0 &&
      !platforms.includes(entry.platform)
    ) {
      return false
    }
    return entry.searchText.toLowerCase().includes(normalized)
  })
}

function claimFor(providerId: ProviderId, entry: Pico8BbsEntry): ProviderClaim {
  return {
    _tag: "ProviderClaim",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    platform: entry.platform,
    playable: playableFor(providerId, entry),
  }
}

function detailsFor(
  providerId: ProviderId,
  entry: Pico8BbsEntry,
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
    playable: playableFor(providerId, entry),
  }
}

function playableFor(providerId: ProviderId, entry: Pico8BbsEntry) {
  return {
    id: entry.id,
    title: entry.title,
    providerId,
    releases: [
      {
        id: entry.platform,
        providerId,
        system: entry.platform,
        ...(entry.downloadUrl ? { target: entry.downloadUrl } : {}),
      },
    ],
  }
}

function resolvePico8BbsDownload(
  providerId: ProviderId,
  candidateUrl: string,
): DownloadResolution {
  const id = parsePico8BbsUrl(candidateUrl)
  if (!id) {
    return {
      _tag: "NonFinalDownload",
      providerId,
      reason: "unsupported",
      url: candidateUrl,
    }
  }

  const entry = byId.get(id)
  if (!entry) {
    return {
      _tag: "FailedDownload",
      providerId,
      reason: "not-found",
      message: `Unknown PICO-8 BBS candidate: ${id}`,
    }
  }

  if (entry.disabledMessage) {
    return {
      _tag: "FailedDownload",
      providerId,
      reason: "not-found",
      message: entry.disabledMessage,
    }
  }

  if (!entry.downloadUrl) {
    return {
      _tag: "NonFinalDownload",
      providerId,
      reason: "unsupported",
      url: candidateUrl,
    }
  }

  return {
    _tag: "FinalDownload",
    providerId,
    url: entry.downloadUrl,
    ...(entry.filename ? { filename: entry.filename } : {}),
    ...(entry.contentType ? { contentType: entry.contentType } : {}),
  }
}

function parsePico8BbsUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.hostname !== "www.lexaloffle.com") return null
  if (url.pathname !== "/bbs/") return null
  return url.searchParams.get("tid")
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
