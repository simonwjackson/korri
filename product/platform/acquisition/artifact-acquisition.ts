import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

import { korriCachePath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type {
  AcquireArtifactRequest,
  AcquiredArtifact,
  PluginAcquireOutput,
} from "@platform/protocol/acquisition/artifact-acquisition"
import { decodeAcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"
import { Effect } from "effect"
import { resolveAcquisitionDownload } from "./download-resolution/download-resolution"
import { validateOutboundHttpUrl } from "./download-resolution/url-policy"
import { acquisitionTry } from "./effect"
import { AcquisitionError } from "./errors"
import { validatePluginAcquireOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"

export interface AcquireArtifactOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: AcquireArtifactRequest
  readonly stagingRoot: string
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch
}

/**
 * Resolves the acquisition-owned staging root for source-native artifacts.
 *
 * Precedence:
 *  1. `KORRI_ACQUISITION_STAGING_ROOT` env override.
 *  2. Sibling of explicit `KORRI_LIBRARY_ROOT`.
 *  3. `<XDG_CACHE_HOME>/korri/acquisition/artifacts`.
 */
export function acquisitionArtifactStagingRoot(env: XdgPathEnv): string {
  const explicit = env.KORRI_ACQUISITION_STAGING_ROOT?.trim()
  if (explicit && explicit.length > 0) return explicit
  const libraryRoot = env.KORRI_LIBRARY_ROOT?.trim()
  if (libraryRoot && libraryRoot.length > 0) {
    return join(dirname(libraryRoot), "acquisition-staging")
  }
  return korriCachePath(env, "acquisition", "artifacts")
}

export function acquireArtifact({
  registry,
  context,
  request,
  stagingRoot,
  fetchImpl,
}: AcquireArtifactOptions): Effect.Effect<AcquiredArtifact, AcquisitionError> {
  return Effect.gen(function* () {
    const plugin = yield* acquisitionTry(() => registry.get(request.providerId))
    const pluginAcquireArtifact = plugin.acquireArtifact
    if (!pluginAcquireArtifact) {
      // Generic fallback: most providers only expose resolve-download. The
      // daemon resolves the final URL through the plugin and fetches the
      // artifact bytes itself, so "Get" works without a per-plugin acquire op.
      return yield* acquireViaResolvedDownload({
        registry,
        context,
        request,
        stagingRoot,
        fetchImpl: fetchImpl ?? fetch,
      })
    }

    const output = yield* runPluginOperation({
      providerId: plugin.metadata.providerId,
      operation: "acquireArtifact",
      context,
      run: () => pluginAcquireArtifact(context, request),
      validate: validatePluginAcquireOutput,
    })
    return yield* stagePluginAcquireOutput({
      output,
      stagingRoot,
      providerId: plugin.metadata.providerId,
    })
  })
}

const MAX_FALLBACK_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024

function acquireViaResolvedDownload({
  registry,
  context,
  request,
  stagingRoot,
  fetchImpl,
}: {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: AcquireArtifactRequest
  readonly stagingRoot: string
  readonly fetchImpl: typeof fetch
}): Effect.Effect<AcquiredArtifact, AcquisitionError> {
  return Effect.gen(function* () {
    if (!request.url) {
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "defective-provider",
          message: `${request.providerId} does not implement acquireArtifact and no claim url was provided for the resolve-download fallback`,
          providerId: request.providerId,
        }),
      )
    }
    const resolution = yield* resolveAcquisitionDownload({
      registry,
      context,
      request: {
        providerId: request.providerId,
        candidateUrl: request.url,
        ...(request.fileName ? { fileName: request.fileName } : {}),
        ...(request.size ? { size: request.size } : {}),
        ...(request.artifactFormat
          ? { artifactFormat: request.artifactFormat }
          : {}),
      },
    })
    if (resolution._tag !== "FinalDownload") {
      const detail =
        resolution._tag === "FailedDownload"
          ? resolution.message
          : `resolution is ${resolution._tag} (${resolution.reason})`
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "infrastructure",
          message: `could not resolve a direct download: ${detail}`,
          providerId: request.providerId,
        }),
      )
    }
    yield* acquisitionTry(() => validateOutboundHttpUrl(resolution.url))

    const fetched = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetchImpl(resolution.url, {
          redirect: "follow",
          ...(resolution.requestHeaders
            ? { headers: resolution.requestHeaders }
            : {}),
        })
        if (!response.ok) {
          throw new Error(`download failed: HTTP ${response.status}`)
        }
        const declared = Number(response.headers.get("content-length") ?? "0")
        if (declared > MAX_FALLBACK_DOWNLOAD_BYTES) {
          throw new Error(`download too large: ${declared} bytes`)
        }
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.byteLength > MAX_FALLBACK_DOWNLOAD_BYTES) {
          throw new Error(`download too large: ${bytes.byteLength} bytes`)
        }
        return {
          bytes,
          contentType:
            response.headers.get("content-type") ?? resolution.contentType,
        }
      },
      catch: error =>
        new AcquisitionError({
          reason: "infrastructure",
          message: `fallback download failed: ${stringifyError(error)}`,
          providerId: request.providerId,
        }),
    })

    const fileName = sanitizeArtifactFileName(
      resolution.filename ??
        request.fileName ??
        downloadUrlBasename(resolution.url),
    )
    const extension = artifactFileExtension(fileName)
    const rejection = rejectNonArtifactPayload({
      bytes: fetched.bytes,
      contentType: fetched.contentType ?? undefined,
      ...(extension ? { extension } : {}),
    })
    if (rejection !== undefined) {
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "infrastructure",
          message: `the source did not deliver the file: ${rejection}`,
          providerId: request.providerId,
        }),
      )
    }
    return yield* stageFetchedArtifactBytes({
      bytes: fetched.bytes,
      providerId: request.providerId,
      stagingRoot,
      file: {
        name: fileName,
        ...(extension ? { extension } : {}),
        ...(fetched.contentType ? { mediaType: fetched.contentType } : {}),
        sizeBytes: fetched.bytes.byteLength,
      },
      formatId: request.artifactFormat ?? extension ?? "binary",
    })
  })
}

/** Leading file-magic bytes for artifact container extensions we can vouch for. */
const ARTIFACT_MAGIC: Readonly<Record<string, readonly (readonly number[])[]>> =
  {
    zip: [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08],
    ],
    "7z": [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
    rar: [[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]],
    gz: [[0x1f, 0x8b]],
    png: [[0x89, 0x50, 0x4e, 0x47]],
  }

const HTML_LEAD = /^\s*<(!doctype\s|html[\s>]|head[\s>]|body[\s>]|script[\s>])/i

/**
 * Sniffs a fetched payload for the "web page instead of a game" failure mode:
 * ROM sites serve HTML interstitials/ad pages with a 200 status and the
 * requested filename, which would otherwise be staged and placed as if they
 * were the real artifact. Returns a human-readable rejection, or undefined
 * when the payload is plausible.
 */
export function rejectNonArtifactPayload(options: {
  readonly bytes: Buffer
  readonly contentType?: string
  readonly extension?: string
}): string | undefined {
  const contentType = options.contentType?.toLowerCase() ?? ""
  const htmlContentType =
    contentType.startsWith("text/html") ||
    contentType.startsWith("application/xhtml")
  const lead = options.bytes.subarray(0, 512).toString("latin1")
  const looksLikeHtml = HTML_LEAD.test(lead.replace(/^\uFEFF/, ""))
  if (htmlContentType || looksLikeHtml) {
    return "received a web page instead of the requested file"
  }
  const magic = options.extension
    ? ARTIFACT_MAGIC[options.extension]
    : undefined
  if (magic) {
    const matches = magic.some(signature =>
      signature.every((byte, index) => options.bytes[index] === byte),
    )
    if (!matches) {
      return `payload does not look like a .${options.extension} file`
    }
  }
  if (options.bytes.byteLength === 0) {
    return "received an empty file"
  }
  return undefined
}

export function sanitizeArtifactFileName(raw: string): string {
  const trimmed = raw.trim().replace(/[/\\]+/g, "_")
  const cleaned = trimmed.replace(/[^\w.() [\]-]+/g, "_").replace(/^\.+/, "")
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "download.bin"
}

export function artifactFileExtension(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf(".")
  if (dot <= 0 || dot === fileName.length - 1) return undefined
  const extension = fileName.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : undefined
}

function downloadUrlBasename(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const base = decodeURIComponent(
      pathname.split("/").filter(Boolean).at(-1) ?? "",
    )
    return base || "download.bin"
  } catch {
    return "download.bin"
  }
}

function stageFetchedArtifactBytes({
  bytes,
  providerId,
  stagingRoot,
  file,
  formatId,
}: {
  readonly bytes: Buffer
  readonly providerId: string
  readonly stagingRoot: string
  readonly file: {
    readonly name: string
    readonly extension?: string
    readonly mediaType?: string
    readonly sizeBytes: number
  }
  readonly formatId: string
}): Effect.Effect<AcquiredArtifact, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const stagedPath = stagedArtifactPath(stagingRoot, sha256, file.extension)
      const acquired = decodeAcquiredArtifact({
        id: `sha256:${sha256}`,
        kind: "content",
        format: { id: formatId },
        file,
        stagedPath,
        digests: { sha256 },
      })
      await promoteStagedBytes(acquired.stagedPath, bytes)
      return acquired
    },
    catch: error =>
      new AcquisitionError({
        reason: "infrastructure",
        message: `failed to stage downloaded artifact: ${stringifyError(error)}`,
        providerId,
      }),
  })
}

function stagePluginAcquireOutput({
  output,
  stagingRoot,
  providerId,
}: {
  readonly output: PluginAcquireOutput
  readonly stagingRoot: string
  readonly providerId: string
}): Effect.Effect<AcquiredArtifact, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const bytes = Buffer.from(output.bytesBase64, "base64")
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const id = `sha256:${sha256}`
      const digests = verifyExpectedDigests(bytes, output.expectedDigests)
      const stagedPath = stagedArtifactPath(
        stagingRoot,
        sha256,
        output.file.extension,
      )
      const acquired = decodeAcquiredArtifact({
        id,
        kind: output.kind,
        system: output.system,
        format: output.format,
        file: output.file,
        stagedPath,
        digests,
        expectedDigests: output.expectedDigests,
        facets: output.facets,
        provenance: output.provenance,
        externalIds: output.externalIds,
        sourceData: output.sourceData,
      })
      await promoteStagedBytes(acquired.stagedPath, bytes)
      return acquired
    },
    catch: error =>
      error instanceof AcquisitionError
        ? new AcquisitionError({
            reason: error.reason,
            message: error.message,
            providerId: error.providerId ?? providerId,
          })
        : new AcquisitionError({
            reason: "infrastructure",
            message: `failed to stage acquired artifact: ${stringifyError(error)}`,
            providerId,
          }),
  })
}

function stagedArtifactPath(
  stagingRoot: string,
  sha256: string,
  extension: string | undefined,
): string {
  const suffix = extension ? `.${extension}` : ""
  return join(stagingRoot, "sha256", sha256.slice(0, 2), `${sha256}${suffix}`)
}

async function promoteStagedBytes(
  target: string,
  bytes: Buffer,
): Promise<void> {
  const targetDir = dirname(target)
  await mkdir(targetDir, { recursive: true })
  const tempPath = join(
    targetDir,
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  )
  try {
    await writeFile(tempPath, bytes, { flag: "wx" })
    await rename(tempPath, target)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

type SupportedDigestAlgorithm = "sha256" | "sha1" | "md5"

function verifyExpectedDigests(
  bytes: Buffer,
  expectedDigests: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const digests: Record<string, string> = {
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
  for (const [algorithm, expected] of Object.entries(expectedDigests ?? {})) {
    if (!isSupportedDigestAlgorithm(algorithm)) {
      throw new AcquisitionError({
        reason: "defective-provider",
        message: `unsupported expected digest algorithm: ${algorithm}`,
      })
    }
    const actual = createHash(algorithm).update(bytes).digest("hex")
    if (actual !== expected) {
      throw new AcquisitionError({
        reason: "defective-provider",
        message: `expected ${algorithm} digest does not match acquired artifact bytes`,
      })
    }
    digests[algorithm] = actual
  }
  return digests
}

function isSupportedDigestAlgorithm(
  algorithm: string,
): algorithm is SupportedDigestAlgorithm {
  return algorithm === "sha256" || algorithm === "sha1" || algorithm === "md5"
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
