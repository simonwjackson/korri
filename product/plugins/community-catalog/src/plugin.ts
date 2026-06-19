import { AcquisitionError } from "@platform/acquisition/errors"
import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"

export const KORRI_COMMUNITY_CATALOG_PLUGIN_ID =
  "@korri:community-catalog" as const

interface CommunityCatalogEntry {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly platform: string
  readonly description: string
  readonly aliases: readonly string[]
  readonly searchText: string
  readonly download?: {
    readonly url: string
    readonly filename: string
    readonly contentType: string
  }
  readonly nonFinalReason?: "unsupported" | "requires-user-action"
}

export const COMMUNITY_CATALOG_ENTRIES: readonly CommunityCatalogEntry[] = [
  {
    id: "xjlt",
    title: "Teenage Mutant Ninja Turtles X Justice League Turbo",
    url: "https://kamekaze.world/xjlt/",
    platform: "ikemen-go",
    description:
      "NewsTeam6's I.K.E.M.E.N. Go fighting game. The public project page advertises Windows, macOS, and Linux builds but does not expose a stable direct artifact URL in markup, so Korri records the claim without inventing a download URL.",
    aliases: ["kamekaze/xjlt", "kamekaze.world/xjlt"],
    searchText:
      "xjlt teenage mutant ninja turtles justice league turbo newsteam6 kamekaze ikemen go fighting",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "tmnt-rescue-palooza",
    title: "Teenage Mutant Ninja Turtles: Rescue-Palooza!",
    url: "https://gamejolt.com/games/TMNT-Rescue-Palooza/39658",
    platform: "windows",
    description:
      "Game Jolt-hosted TMNT fangame by Merso X. Game Jolt download selection is provider-controlled and should be resolved by a Game Jolt-specific integration rather than scraped or guessed here.",
    aliases: ["gamejolt/39658", "TMNT-Rescue-Palooza", "39658"],
    searchText:
      "teenage mutant ninja turtles tmnt rescue palooza merso x gamejolt 39658 windows fangame",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "am2rlauncher",
    title: "AM2RLauncher",
    url: "https://github.com/AM2R-Community-Developers/AM2RLauncher",
    platform: "launcher",
    description:
      "GPL-3.0 AM2R community launcher repository. The launcher is source-available, but game acquisition must remain separate from original AM2R entitlement/payload handling.",
    aliases: ["AM2R-Community-Developers/AM2RLauncher", "am2r"],
    searchText:
      "am2r am2rlauncher another metroid 2 remake community developers github launcher acquisition catalog",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "sonic-3-air",
    title: "Sonic 3 A.I.R.",
    url: "https://github.com/Eukaryot/sonic3air",
    platform: "source-port",
    description:
      "GPL-3.0 Sonic 3 A.I.R. / Oxygen Engine source repository. Launchable installation requires the user's Sonic 3 & Knuckles data; Korri records the source project without bypassing that requirement.",
    aliases: ["Eukaryot/sonic3air", "sonic3air"],
    searchText:
      "sonic 3 air angel island revisited oxygen engine eukaryot github source port sonic3air",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "shipwright",
    title: "Ship of Harkinian",
    url: "https://github.com/HarbourMasters/Shipwright",
    platform: "source-port",
    description:
      "HarbourMasters' Shipwright / Ship of Harkinian source repository. A playable setup requires user-supplied original game data, so this catalog entry does not expose a direct game download.",
    aliases: ["HarbourMasters/Shipwright", "ship-of-harkinian", "soh"],
    searchText:
      "shipwright ship of harkinian harbourmasters github source port ocarina of time soh",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "spelunky-classic-hd",
    title: "Spelunky Classic HD",
    url: "https://github.com/JanTrueno/SpelunkyClassicHD",
    platform: "source-port",
    description:
      "JanTrueno's GameMaker LTS modernization of Derek Yu's Spelunky Classic. The public GitHub source is cataloged; build/import automation can be layered on separately.",
    aliases: ["JanTrueno/SpelunkyClassicHD"],
    searchText:
      "spelunky classic hd jantrueno github game maker lts derek yu source",
    nonFinalReason: "unsupported",
  },
  {
    id: "srb2kart",
    title: "Sonic Robo Blast 2 Kart",
    url: "https://github.com/STJr/Kart-Public",
    platform: "source-port",
    description:
      "GPL-2.0 SRB2 Kart public source repository. Korri records the acquisition candidate while leaving build/productization to a dedicated SRB2Kart plugin.",
    aliases: ["STJr/Kart-Public", "kart-public", "srb2-kart"],
    searchText:
      "srb2kart sonic robo blast 2 kart stjr kart-public github source gpl",
    nonFinalReason: "unsupported",
  },
  {
    id: "stargrove-scramble",
    title: "Stargrove Scramble",
    url: "https://team-bugulon.itch.io/stargrove-scramble",
    platform: "itchio-html5-windows",
    description:
      "Free Team Bugulon GameMaker platformer on itch.io with HTML5 and Windows releases. Download resolution is delegated to the itch.io provider so public/authenticated itch flows stay centralized.",
    aliases: ["team-bugulon/stargrove-scramble"],
    searchText:
      "stargrove scramble team bugulon itch.io itch platformer gamemaker eggs windows html5",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "dome-romantik",
    title: "Dome Romantik",
    url: "https://bippinbits.itch.io/dome-romantik",
    platform: "itchio-html5-windows-linux",
    description:
      "Free Ludum Dare 48 jam version of Dome Keeper by bippinbits and Cameron Paxton on itch.io, with HTML5, Windows, and Linux releases. Download resolution remains delegated to the itch.io provider.",
    aliases: ["bippinbits/dome-romantik"],
    searchText:
      "dome romantik bippinbits cameron paxton dome keeper ludum dare 48 itch.io godot linux windows html5",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "globeba",
    title: "Globeba",
    url: "https://team-bugulon.itch.io/globeba",
    platform: "itchio-html5-windows",
    description:
      "Free Team Bugulon Ludum Dare 55 action-adventure on itch.io with HTML5 and Windows releases. Download resolution is delegated to the itch.io provider.",
    aliases: ["team-bugulon/globeba"],
    searchText:
      "globeba team bugulon itch.io ludum dare 55 game maker adventure role playing windows html5",
    nonFinalReason: "requires-user-action",
  },
  {
    id: "mega-man-rock-n-roll",
    title: "Mega Man Rock N Roll",
    url: "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip",
    platform: "linux-x86_64",
    description:
      "Public Linux 1.3 ZIP for Dennis Engelhard's Mega Man Rock N Roll. This source is a stable direct artifact URL and can be resolved without auth or interstitial flow.",
    aliases: ["megaman-rocknroll", "mega-man-rocknroll"],
    searchText:
      "mega man rock n roll megaman rocknroll dennis engelhard linux 1.3 direct zip godot fangame",
    download: {
      url: "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip",
      filename: "megaman_rocknroll_linux_1.3.zip",
      contentType: "application/zip",
    },
  },
  {
    id: "tiny-crate",
    title: "Tiny Crate",
    url: "https://github.com/HarmonyHoney/tiny_crate",
    platform: "source-port",
    description:
      "Unlicense Godot 3.6 source repository for Harmony Honey's crate-chucking puzzle platformer. A source-build/import path can be productized separately.",
    aliases: ["HarmonyHoney/tiny_crate", "tiny_crate"],
    searchText:
      "tiny crate harmonyhoney harmony honey github godot 3.6 unlicense puzzle platformer tiny_crate",
    nonFinalReason: "unsupported",
  },
  {
    id: "sonic-time-twisted",
    title: "Sonic Time Twisted",
    url: "https://github.com/overbound/SonicTimeTwisted",
    platform: "source-port",
    description:
      "GPL-3.0 GameMaker source repository for Overbound's Sonic Time Twisted. Build/import automation is deferred to a dedicated runtime or package plugin.",
    aliases: ["overbound/SonicTimeTwisted", "sonic-time-twisted"],
    searchText:
      "sonic time twisted overbound github game maker source gpl fangame",
    nonFinalReason: "unsupported",
  },
]

const entriesById = new Map(
  COMMUNITY_CATALOG_ENTRIES.map(entry => [entry.id, entry] as const),
)
const entriesByAlias = new Map(
  COMMUNITY_CATALOG_ENTRIES.flatMap(entry =>
    [entry.id, ...entry.aliases].map(alias => [alias.toLowerCase(), entry] as const),
  ),
)

export const communityCatalogPlugin = plugin({
  namespace: "@korri",
  name: "community-catalog",
  title: "Community Game Catalog",
  description:
    "Curated acquisition catalog for public community and fangame sources requested for Korri productization.",
  contributes: {
    config: {
      providers: {
        [KORRI_COMMUNITY_CATALOG_PLUGIN_ID]: {
          module: "product/plugins/community-catalog",
          legalRisk: "medium",
          credentialRequired: false,
          enabledByDefault: true,
        },
      },
    },
    handlers: [
      {
        id: "community-catalog.claims-search",
        operation: "claims.search",
        capabilities: ["claims.search", "community-catalog"],
        run: context => {
          const input = recordInput(context.input)
          const query = stringValue(input.query).trim().toLowerCase()
          const platforms = Array.isArray(input.platforms)
            ? input.platforms.filter((value): value is string => typeof value === "string")
            : undefined
          if (query.length === 0) return []
          return COMMUNITY_CATALOG_ENTRIES.filter(entry => {
            if (platforms && platforms.length > 0 && !platforms.includes(entry.platform)) {
              return false
            }
            return entry.searchText.toLowerCase().includes(query)
          }).map(entry => claimFor(entry, context.provider))
        },
      },
      {
        id: "community-catalog.claims-details",
        operation: "claims.details",
        capabilities: ["claims.details", "community-catalog"],
        run: context => {
          const id = requiredString(recordInput(context.input).id, "id")
          const entry = findEntry(id)
          if (!entry) {
            return Effect.fail(
              new AcquisitionError({
                reason: "caller",
                providerId: context.provider,
                message: `Unknown community catalog candidate: ${id}`,
              }),
            )
          }
          return detailsFor(entry, context.provider)
        },
      },
      {
        id: "community-catalog.claims-parse-url",
        operation: "claims.parse-url",
        capabilities: ["claims.parse-url", "community-catalog"],
        run: context => {
          const url = stringValue(recordInput(context.input).url)
          return url ? parseCommunityCatalogUrl(url) : null
        },
      },
      {
        id: "community-catalog.provider-validate",
        operation: "provider.validate",
        capabilities: ["provider.validate", "community-catalog"],
        run: context => {
          const checkedAt = stringValue(recordInput(context.input).checkedAt)
          return {
            _tag: "HealthyProvider" as const,
            providerId: context.provider,
            checkedAt: checkedAt || new Date(0).toISOString(),
          }
        },
      },
      {
        id: "community-catalog.artifact-resolve-download",
        operation: "artifact.resolve-download",
        capabilities: ["artifact.resolve-download", "community-catalog"],
        run: context => {
          const candidateUrl = requiredString(
            recordInput(context.input).candidateUrl,
            "candidateUrl",
          )
          const id = parseCommunityCatalogUrl(candidateUrl)
          const entry = id ? findEntry(id) : undefined
          if (!entry) {
            return {
              _tag: "NonFinalDownload" as const,
              providerId: context.provider,
              reason: "unsupported" as const,
              url: candidateUrl,
            } satisfies DownloadResolution
          }
          if (!entry.download) {
            return {
              _tag: "NonFinalDownload" as const,
              providerId: context.provider,
              reason: entry.nonFinalReason ?? "unsupported",
              url: candidateUrl,
            } satisfies DownloadResolution
          }
          return {
            _tag: "FinalDownload" as const,
            providerId: context.provider,
            url: entry.download.url,
            filename: entry.download.filename,
            contentType: entry.download.contentType,
          } satisfies DownloadResolution
        },
      },
      {
        id: "community-catalog.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["community-catalog"],
        run: context => ({
          provider: context.provider,
          entries: COMMUNITY_CATALOG_ENTRIES.length,
          finalDownloads: COMMUNITY_CATALOG_ENTRIES.filter(entry => entry.download).length,
        }),
      },
    ],
  },
})

function claimFor(entry: CommunityCatalogEntry, providerId: ProviderId): ProviderClaim {
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
  entry: CommunityCatalogEntry,
  providerId: ProviderId,
): ProviderClaimDetails {
  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    description: entry.description,
    ...(entry.download ? { downloadPageUrl: entry.download.url } : {}),
    playable: playableFor(entry, providerId),
  }
}

function playableFor(entry: CommunityCatalogEntry, providerId: ProviderId) {
  return {
    id: entry.id,
    title: entry.title,
    providerId,
    collections: ["community-catalog"],
    releases: [
      {
        id: entry.platform,
        providerId,
        system: entry.platform,
        target: { kind: "url" as const, value: entry.download?.url ?? entry.url },
      },
    ],
  }
}

function findEntry(id: string): CommunityCatalogEntry | undefined {
  return entriesById.get(id) ?? entriesByAlias.get(id.toLowerCase())
}

export function parseCommunityCatalogUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "")

  if (host === "kamekaze.world" && pathname === "/xjlt") return "xjlt"

  if (host === "gamejolt.com") {
    const match = pathname.match(/^\/games\/TMNT-Rescue-Palooza\/39658$/i)
    if (match) return "tmnt-rescue-palooza"
  }

  if (host === "github.com") {
    const parts = pathname.split("/").filter(Boolean)
    const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}`.toLowerCase() : null
    switch (repo) {
      case "am2r-community-developers/am2rlauncher":
        return "am2rlauncher"
      case "eukaryot/sonic3air":
        return "sonic-3-air"
      case "harbourmasters/shipwright":
        return "shipwright"
      case "jantrueno/spelunkyclassichd":
        return "spelunky-classic-hd"
      case "stjr/kart-public":
        return "srb2kart"
      case "harmonyhoney/tiny_crate":
        return "tiny-crate"
      case "overbound/sonictimetwisted":
        return "sonic-time-twisted"
      default:
        return null
    }
  }

  if (host.endsWith(".itch.io")) {
    const creator = host.replace(/\.itch\.io$/, "")
    const slug = pathname.split("/").filter(Boolean)[0]
    switch (`${creator}/${slug}`) {
      case "team-bugulon/stargrove-scramble":
        return "stargrove-scramble"
      case "bippinbits/dome-romantik":
        return "dome-romantik"
      case "team-bugulon/globeba":
        return "globeba"
      default:
        return null
    }
  }

  if (
    host === "dennisengelhard.com" &&
    pathname === "/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip"
  ) {
    return "mega-man-rock-n-roll"
  }

  return null
}

function parseUrl(input: string): URL | null {
  try {
    const url = new URL(input)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function recordInput(input: unknown): Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Readonly<Record<string, unknown>>)
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function requiredString(value: unknown, field: string): string {
  const result = stringValue(value).trim()
  if (result.length === 0) throw new Error(`${field} is required`)
  return result
}
