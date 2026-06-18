import { AcquisitionError } from "@platform/acquisition/errors"
import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type { PluginAcquireOutput } from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  ArtifactAcquisitionHint,
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import type { ArtifactFacets } from "@platform/protocol/artifact/artifact"
import { Effect } from "effect"

export const KORRI_SMWCENTRAL_PLUGIN_ID = "@korri:smwcentral" as const

const DEFAULT_API_BASE_URL = "https://www.smwcentral.net/ajax.php"
const DEFAULT_WEB_BASE_URL = "https://www.smwcentral.net"
const DEFAULT_DOWNLOAD_HOST = "dl.smwcentral.net"
const SMW_HACKS_SECTION = "smwhacks"
const SMW_HACK_SYSTEM = "super-mario-world"
const SMW_HACK_FORMAT = "smwcentral-smw-hack-archive"
const ZIP_MEDIA_TYPE = "application/zip"
const SOURCE_DATA_NAMESPACE = "smwcentral.smwhacks.v1"

export interface SmwCentralPluginOptions {
  readonly apiBaseUrl?: string
  readonly webBaseUrl?: string
  readonly downloadHost?: string
  readonly fetchImpl?: typeof fetch
}

interface SmwCentralRuntime {
  readonly apiBaseUrl: string
  readonly webBaseUrl: string
  readonly downloadHost: string
  readonly fetchImpl: typeof fetch
}

interface SmwCentralAuthor {
  readonly id?: unknown
  readonly name?: unknown
}

interface SmwCentralFile {
  readonly id?: unknown
  readonly section?: unknown
  readonly name?: unknown
  readonly time?: unknown
  readonly submitted_at?: unknown
  readonly moderated_at?: unknown
  readonly authors?: unknown
  readonly submitter?: unknown
  readonly moderator?: unknown
  readonly tags?: unknown
  readonly images?: unknown
  readonly rating?: unknown
  readonly size?: unknown
  readonly downloads?: unknown
  readonly download_url?: unknown
  readonly obsoleted_by?: unknown
  readonly fields?: unknown
  readonly raw_fields?: unknown
  readonly versions?: unknown
}

interface SmwCentralSectionPayload {
  readonly data?: unknown
}

interface ParsedSmwCentralUrl {
  readonly id: string
  readonly kind: "details" | "download"
}

const hackArtifactHint = {
  kind: "patch" as const,
  system: SMW_HACK_SYSTEM,
  format: { id: SMW_HACK_FORMAT },
} satisfies ArtifactAcquisitionHint

export function createSmwCentralPlugin(options: SmwCentralPluginOptions = {}) {
  const runtime = createRuntime(options)

  return plugin({
    namespace: "@korri",
    name: "smwcentral",
    title: "SMW Central SMW Hacks",
    description:
      "Adds SMW Central Super Mario World hack search, details, direct download resolution, and ZIP acquisition.",
    contributes: {
      handlers: [
        {
          id: "smwcentral.claims-search",
          operation: "claims.search",
          capabilities: ["claims.search", "smwcentral", "smwhacks"],
          run: context => {
            const input = readRecord(context.input)
            const query = typeof input.query === "string" ? input.query : ""
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (platform): platform is string =>
                    typeof platform === "string",
                )
              : undefined
            return searchSmwHacks(runtime, context.provider, query, platforms)
          },
        },
        {
          id: "smwcentral.claims-details",
          operation: "claims.details",
          capabilities: ["claims.details", "smwcentral", "smwhacks"],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            return fetchFile(runtime, id).pipe(
              Effect.map(file => detailsFor(runtime, context.provider, file)),
            )
          },
        },
        {
          id: "smwcentral.claims-parse-url",
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", "smwcentral", "smwhacks"],
          run: context => {
            const input = readRecord(context.input)
            const url = typeof input.url === "string" ? input.url : ""
            return parseSmwCentralUrl(url, runtime)?.id ?? null
          },
        },
        {
          id: "smwcentral.provider-validate",
          operation: "provider.validate",
          capabilities: ["provider.validate", "smwcentral", "smwhacks"],
          run: context => {
            const input = readRecord(context.input)
            return fetchSection(runtime, { perPage: 1 }).pipe(
              Effect.map(
                () =>
                  ({
                    _tag: "HealthyProvider" as const,
                    providerId: context.provider,
                    checkedAt:
                      typeof input.checkedAt === "string"
                        ? input.checkedAt
                        : new Date(0).toISOString(),
                  }) satisfies ProviderHealth,
              ),
            )
          },
        },
        {
          id: "smwcentral.artifact-resolve-download",
          operation: "artifact.resolve-download",
          capabilities: ["artifact.resolve-download", "smwcentral", "smwhacks"],
          run: context => {
            const input = readRecord(context.input)
            const candidateUrl = stringField(input, "candidateUrl")
            return resolveSmwHackDownload(
              runtime,
              context.provider,
              candidateUrl,
            )
          },
        },
        {
          id: "smwcentral.artifact-acquire",
          operation: "artifact.acquire",
          capabilities: ["artifact.acquire", "smwcentral", "smwhacks"],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            return Effect.gen(function* () {
              const file = yield* fetchFile(runtime, id)
              const downloadUrl = requiredString(
                file.download_url,
                "download_url",
              )
              const bytes = yield* fetchBytes(runtime, downloadUrl)
              return acquireOutputFor({
                runtime,
                providerId: context.provider,
                acquiredAt: new Date().toISOString(),
                file,
                bytes,
              })
            })
          },
        },
        {
          id: "smwcentral.diagnostics",
          operation: "diagnostics.collect",
          capabilities: ["smwcentral", "smwhacks"],
          run: context => ({
            provider: context.provider,
            status: "ok",
            apiBaseUrl: runtime.apiBaseUrl,
            webBaseUrl: runtime.webBaseUrl,
            section: SMW_HACKS_SECTION,
          }),
        },
      ],
    },
  })
}

export const smwCentralPlugin = createSmwCentralPlugin()

function createRuntime({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  webBaseUrl = DEFAULT_WEB_BASE_URL,
  downloadHost = DEFAULT_DOWNLOAD_HOST,
  fetchImpl = globalThis.fetch,
}: SmwCentralPluginOptions): SmwCentralRuntime {
  if (!fetchImpl) {
    throw new AcquisitionError({
      reason: "configuration",
      providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
      message: "global fetch is not available for SMW Central",
    })
  }
  return {
    apiBaseUrl,
    webBaseUrl: trimTrailingSlash(webBaseUrl),
    downloadHost,
    fetchImpl,
  }
}

function searchSmwHacks(
  runtime: SmwCentralRuntime,
  providerId: ProviderId,
  query: string,
  platforms?: readonly string[],
): Effect.Effect<readonly ProviderClaim[], AcquisitionError> {
  const normalized = query.trim()
  if (normalized.length === 0) return Effect.succeed([])
  if (
    platforms &&
    platforms.length > 0 &&
    !platforms.includes(SMW_HACK_SYSTEM) &&
    !platforms.includes("smw-hack")
  ) {
    return Effect.succeed([])
  }

  if (/^\d+$/.test(normalized)) {
    return fetchFile(runtime, normalized).pipe(
      Effect.map(file => [claimFor(runtime, providerId, file)]),
      Effect.catchTag("AcquisitionError", () => Effect.succeed([])),
    )
  }

  return fetchSection(runtime, { query: normalized }).pipe(
    Effect.map(payload =>
      arrayValue(payload.data)
        .map(asFile)
        .filter((file): file is SmwCentralFile => file !== null)
        .map(file => claimFor(runtime, providerId, file)),
    ),
  )
}

function resolveSmwHackDownload(
  runtime: SmwCentralRuntime,
  providerId: ProviderId,
  candidateUrl: string,
): Effect.Effect<DownloadResolution, AcquisitionError> {
  const parsed = parseSmwCentralUrl(candidateUrl, runtime)
  if (!parsed) {
    return Effect.succeed({
      _tag: "NonFinalDownload" as const,
      providerId,
      reason: "unsupported" as const,
      url: candidateUrl,
    })
  }

  if (parsed.kind === "download") {
    return Effect.succeed({
      _tag: "FinalDownload" as const,
      providerId,
      url: candidateUrl,
      filename: safeFileNameFromUrl(candidateUrl),
      contentType: ZIP_MEDIA_TYPE,
    })
  }

  return fetchFile(runtime, parsed.id).pipe(
    Effect.map(file => {
      const downloadUrl = stringValue(file.download_url)
      if (!downloadUrl) {
        return {
          _tag: "FailedDownload" as const,
          providerId,
          reason: "not-found" as const,
          message: `SMW Central file ${parsed.id} does not expose a download URL`,
        } satisfies DownloadResolution
      }
      return {
        _tag: "FinalDownload" as const,
        providerId,
        url: downloadUrl,
        filename: safeFileNameFromUrl(downloadUrl),
        contentType: ZIP_MEDIA_TYPE,
      } satisfies DownloadResolution
    }),
  )
}

function fetchSection(
  runtime: SmwCentralRuntime,
  options: { readonly query?: string; readonly perPage?: number } = {},
): Effect.Effect<SmwCentralSectionPayload, AcquisitionError> {
  const url = new URL(runtime.apiBaseUrl)
  url.searchParams.set("a", "getsectionlist")
  url.searchParams.set("s", SMW_HACKS_SECTION)
  url.searchParams.set("u", "0")
  if (options.query) url.searchParams.set("f[name]", options.query)
  if (options.perPage) url.searchParams.set("l", String(options.perPage))
  return fetchJson(runtime, url.toString()).pipe(
    Effect.map(payload => readRecord(payload) as SmwCentralSectionPayload),
  )
}

function fetchFile(
  runtime: SmwCentralRuntime,
  id: string,
): Effect.Effect<SmwCentralFile, AcquisitionError> {
  const url = new URL(runtime.apiBaseUrl)
  url.searchParams.set("a", "getfile")
  url.searchParams.set("v", "2")
  url.searchParams.set("id", id)
  return fetchJson(runtime, url.toString()).pipe(
    Effect.flatMap(payload => {
      const file = asFile(payload)
      if (!file) {
        return Effect.fail(
          new AcquisitionError({
            reason: "caller",
            providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
            message: `Unknown SMW Central file: ${id}`,
          }),
        )
      }
      if (stringValue(file.section) !== SMW_HACKS_SECTION) {
        return Effect.fail(
          new AcquisitionError({
            reason: "caller",
            providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
            message: `SMW Central file ${id} is not in ${SMW_HACKS_SECTION}`,
          }),
        )
      }
      return Effect.succeed(file)
    }),
  )
}

function fetchJson(
  runtime: SmwCentralRuntime,
  url: string,
): Effect.Effect<unknown, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await runtime.fetchImpl(url, {
        headers: {
          accept: "application/json",
          "user-agent": "Korri/0.1 (+https://github.com/simonwjackson/korri)",
        },
      })
      if (!response.ok) {
        throw new AcquisitionError({
          reason: response.status === 404 ? "caller" : "infrastructure",
          providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
          message: `SMW Central API returned HTTP ${response.status} for ${url}`,
        })
      }
      return await response.json()
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "infrastructure",
            providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
            message: `SMW Central API request failed: ${stringifyError(error)}`,
          }),
  })
}

function fetchBytes(
  runtime: SmwCentralRuntime,
  url: string,
): Effect.Effect<Buffer, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await runtime.fetchImpl(url, {
        headers: { accept: "application/zip,application/octet-stream" },
      })
      if (!response.ok) {
        throw new AcquisitionError({
          reason: response.status === 404 ? "caller" : "infrastructure",
          providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
          message: `SMW Central download returned HTTP ${response.status} for ${url}`,
        })
      }
      return Buffer.from(await response.arrayBuffer())
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "infrastructure",
            providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
            message: `SMW Central download failed: ${stringifyError(error)}`,
          }),
  })
}

function claimFor(
  runtime: SmwCentralRuntime,
  providerId: ProviderId,
  file: SmwCentralFile,
): ProviderClaim {
  const id = requiredString(file.id, "id")
  const title = requiredString(file.name, "name")
  const thumbnailUrl = arrayOfStrings(file.images)[0]
  return withoutUndefined({
    _tag: "ProviderClaim" as const,
    providerId,
    id,
    ref: { kind: "provider-item-id" as const, value: id },
    title,
    url: detailsUrl(runtime, id),
    platform: SMW_HACK_SYSTEM,
    thumbnailUrl,
    artifact: artifactHintFor(file),
    playable: playableFor(runtime, providerId, file),
  })
}

function detailsFor(
  runtime: SmwCentralRuntime,
  providerId: ProviderId,
  file: SmwCentralFile,
): ProviderClaimDetails {
  const id = requiredString(file.id, "id")
  const title = requiredString(file.name, "name")
  const description = descriptionFor(file)
  return withoutUndefined({
    _tag: "ProviderClaimDetails" as const,
    providerId,
    id,
    ref: { kind: "provider-item-id" as const, value: id },
    title,
    url: detailsUrl(runtime, id),
    description,
    downloadPageUrl: stringValue(file.download_url),
    artifact: artifactHintFor(file),
    playable: playableFor(runtime, providerId, file),
    facets: facetsFor(runtime, file),
  })
}

function playableFor(
  runtime: SmwCentralRuntime,
  providerId: ProviderId,
  file: SmwCentralFile,
) {
  const id = requiredString(file.id, "id")
  const title = requiredString(file.name, "name")
  return {
    id,
    title,
    providerId,
    releases: [
      {
        id: "patch-archive",
        providerId,
        system: SMW_HACK_SYSTEM,
        target: detailsUrl(runtime, id),
      },
    ],
  }
}

function artifactHintFor(file: SmwCentralFile): ArtifactAcquisitionHint {
  const downloadUrl = stringValue(file.download_url)
  const sizeBytes = numberValue(file.size)
  return withoutUndefined({
    ...hackArtifactHint,
    file: downloadUrl
      ? withoutUndefined({
          name:
            safeFileNameFromUrl(downloadUrl) ??
            `${requiredString(file.id, "id")}.zip`,
          extension: "zip" as const,
          mediaType: ZIP_MEDIA_TYPE,
          sizeBytes,
        })
      : undefined,
  })
}

function acquireOutputFor({
  runtime,
  providerId,
  acquiredAt,
  file,
  bytes,
}: {
  readonly runtime: SmwCentralRuntime
  readonly providerId: ProviderId
  readonly acquiredAt: string
  readonly file: SmwCentralFile
  readonly bytes: Buffer
}): PluginAcquireOutput {
  const id = requiredString(file.id, "id")
  const downloadUrl = requiredString(file.download_url, "download_url")
  return withoutUndefined({
    kind: "patch" as const,
    system: SMW_HACK_SYSTEM,
    format: { id: SMW_HACK_FORMAT },
    file: {
      name: safeFileNameFromUrl(downloadUrl) ?? `${id}.zip`,
      extension: "zip" as const,
      mediaType: ZIP_MEDIA_TYPE,
      sizeBytes: bytes.length,
    },
    bytesBase64: bytes.toString("base64"),
    facets: facetsFor(runtime, file),
    provenance: {
      source: providerId,
      acquiredAt,
      url: detailsUrl(runtime, id),
    },
    externalIds: [{ namespace: providerId, id }],
    sourceData: sourceDataFor(file),
  })
}

function facetsFor(
  runtime: SmwCentralRuntime,
  file: SmwCentralFile,
): ArtifactFacets {
  const authors = authorsFor(runtime, file)
  const tags = [
    ...arrayOfStrings(file.tags),
    displayFieldFrom(file, "difficulty"),
    displayFieldFrom(file, "type"),
    displayFieldFrom(file, "length"),
  ].filter((value): value is string => Boolean(value))
  const media = arrayOfStrings(file.images).map(url => ({
    kind: "image" as const,
    role: "screenshot",
    url,
  }))
  return withoutUndefined({
    title: { text: requiredString(file.name, "name") },
    description: descriptionFor(file)
      ? { text: requiredString(descriptionFor(file), "description") }
      : undefined,
    credits: authors.length > 0 ? { authors } : undefined,
    tags: tags.length > 0 ? tags : undefined,
    communityStats: numberRecord({
      rating: numberValue(file.rating),
      downloads: numberValue(file.downloads),
    }),
    media: media.length > 0 ? media : undefined,
  })
}

function sourceDataFor(file: SmwCentralFile) {
  return {
    [SOURCE_DATA_NAMESPACE]: withoutUndefined({
      fileId: requiredString(file.id, "id"),
      section: stringValue(file.section),
      submittedAt: numberValue(file.submitted_at),
      moderatedAt: numberValue(file.moderated_at),
      version: stringFieldFrom(file, "version"),
      difficulty: stringFieldFrom(file, "difficulty"),
      type: stringFieldFrom(file, "type"),
      length: stringFieldFrom(file, "length"),
      demo: rawFieldFrom(file, "demo"),
      sa1: rawFieldFrom(file, "sa1"),
      obsoletedBy: stringValue(file.obsoleted_by),
    }),
  }
}

function authorsFor(runtime: SmwCentralRuntime, file: SmwCentralFile) {
  return arrayValue(file.authors)
    .map(author => readRecord(author) as SmwCentralAuthor)
    .map(author => {
      const id = stringValue(author.id)
      return withoutUndefined({
        name: requiredString(author.name, "author.name"),
        role: "author",
        url: id ? `${runtime.webBaseUrl}/?p=profile&id=${id}` : undefined,
      })
    })
}

export function parseSmwCentralUrl(
  input: string,
  runtime: Pick<SmwCentralRuntime, "webBaseUrl" | "downloadHost"> = {
    webBaseUrl: DEFAULT_WEB_BASE_URL,
    downloadHost: DEFAULT_DOWNLOAD_HOST,
  },
): ParsedSmwCentralUrl | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  const web = new URL(runtime.webBaseUrl)
  if (url.hostname === web.hostname) {
    if (url.searchParams.get("p") !== "section") return null
    if (url.searchParams.get("a") !== "details") return null
    const id = url.searchParams.get("id")
    return id && /^\d+$/.test(id) ? { id, kind: "details" } : null
  }

  if (url.hostname === runtime.downloadHost) {
    const id = url.pathname.split("/").filter(Boolean)[0]
    return id && /^\d+$/.test(id) ? { id, kind: "download" } : null
  }

  return null
}

function detailsUrl(runtime: SmwCentralRuntime, id: string): string {
  return `${runtime.webBaseUrl}/?p=section&a=details&id=${encodeURIComponent(id)}`
}

function descriptionFor(file: SmwCentralFile): string | undefined {
  return stringFieldFrom(file, "description")?.slice(0, 8192)
}

function stringFieldFrom(
  file: SmwCentralFile,
  key: string,
): string | undefined {
  return (
    fieldString(readRecord(file.raw_fields)[key]) ?? displayFieldFrom(file, key)
  )
}

function displayFieldFrom(
  file: SmwCentralFile,
  key: string,
): string | undefined {
  return fieldString(readRecord(file.fields)[key])
}

function fieldString(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map(String).join(", ")
  return stringValue(value)
}

function rawFieldFrom(file: SmwCentralFile, key: string): unknown {
  return readRecord(file.raw_fields)[key]
}

function asFile(input: unknown): SmwCentralFile | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null
  }
  return input as SmwCentralFile
}

function arrayValue(input: unknown): readonly unknown[] {
  return Array.isArray(input) ? input : []
}

function arrayOfStrings(input: unknown): readonly string[] {
  return Array.isArray(input)
    ? input.filter((value): value is string => typeof value === "string")
    : []
}

function numberRecord(input: Record<string, number | undefined>) {
  return withoutUndefined(input)
}

function numberValue(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined
}

function stringValue(input: unknown): string | undefined {
  if (typeof input === "string" && input.length > 0) return input
  if (typeof input === "number" && Number.isFinite(input)) return String(input)
  return undefined
}

function requiredString(input: unknown, field: string): string {
  const value = stringValue(input)
  if (!value) throw new Error(`SMW Central ${field} is required`)
  return value
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

function safeFileNameFromUrl(input: string): string | undefined {
  try {
    const pathname = new URL(input).pathname
    const last = pathname.split("/").filter(Boolean).at(-1)
    return last ? decodeURIComponent(last).replace(/[\\/\0]/g, "_") : undefined
  } catch {
    return undefined
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
