import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { AcquisitionError } from "@platform/acquisition/errors"
import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_RETROARCH_PLUGIN_ID } from "../../retroarch"
import type {
  PortMasterCompatibilityProfile,
  PortMasterCompatibilityProfileMap,
} from "./compatibility"
import {
  type PortMasterLaunchInputCompatibilityInput,
  type PortMasterLaunchPresentationInput,
  type PortMasterLaunchRuntimeCompatibilityInput,
  preparePortMasterLaunchEnvelope,
} from "./envelope"
import {
  installPortMasterEntry,
  type PortMasterArmhfQemuWrapperOptions,
  type PortMasterFexWrapperOptions,
  type PortMasterNativeElfRepairOptions,
} from "./installer"

export const KORRI_PORTMASTER_PLUGIN_ID = "@korri:portmaster" as const

const DEFAULT_CATALOG_URL =
  "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-06-09_2128/ports.json"
const DETAIL_BASE_URL = "https://portmaster.games/detail.html?name="
const PLATFORM = "linux-port"
const CONTENT_TYPE = "application/zip"
const MAX_SEARCH_RESULTS = 50

export interface PortMasterPluginOptions {
  readonly catalogUrl?: string
  readonly catalogPath?: string
  readonly fetchImpl?: typeof fetch
  readonly readFileText?: (path: string) => Promise<string>
  readonly installRoot?: string
  readonly nativeElfRepair?: PortMasterNativeElfRepairOptions
  readonly fexWrapper?: PortMasterFexWrapperOptions
  readonly armhfQemuWrapper?: PortMasterArmhfQemuWrapperOptions
  readonly compatibilityPath?: string
  readonly compatibility?: PortMasterCompatibilityProfileMap
}

interface PortMasterRuntime {
  readonly catalogUrl: string
  readonly catalogPath?: string
  readonly fetchImpl: typeof fetch
  readonly readFileText: (path: string) => Promise<string>
  readonly installRoot: string
  readonly nativeElfRepair?: PortMasterNativeElfRepairOptions
  readonly fexWrapper?: PortMasterFexWrapperOptions
  readonly armhfQemuWrapper?: PortMasterArmhfQemuWrapperOptions
  readonly compatibilityPath?: string
  readonly compatibility?: PortMasterCompatibilityProfileMap
  catalog?: Promise<readonly PortMasterEntry[]>
  compatibilityDb?: Promise<ReadonlyMap<string, PortMasterCompatibilityProfile>>
}

interface PortMasterEntry {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly instructions?: string
  readonly genres: readonly string[]
  readonly porters: readonly string[]
  readonly runtime: readonly string[]
  readonly reqs: readonly string[]
  readonly arch: readonly string[]
  readonly items: readonly string[]
  readonly readyToRun: boolean
  readonly experimental: boolean
  readonly availability?: string
  readonly downloadUrl?: string
  readonly size?: number
  readonly md5?: string
  readonly searchText: string
}

interface RawPortMasterEntry {
  readonly name?: unknown
  readonly items?: unknown
  readonly attr?: unknown
  readonly source?: unknown
}

export function createPortMasterPlugin(options: PortMasterPluginOptions = {}) {
  const runtime = createRuntime(options)

  return plugin({
    namespace: "@korri",
    name: "portmaster",
    title: "PortMaster",
    description:
      "Adds the PortMaster handheld port manager plus the upstream PortMaster ports catalog as an acquisition source.",
    requires: [
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_FEX_PLUGIN_ID, id: "linux-user" },
        reason:
          "PortMaster's x86/x86_64 compatibility lane launches Linux userland ports through FEX on aarch64 devices.",
      },
      {
        capability: "libretro.app-host",
        ref: { provider: KORRI_RETROARCH_PLUGIN_ID, id: "retroarch" },
        reason:
          "PortMaster libretro ports launch their packaged cores through the RetroArch app host.",
      },
    ],
    contributes: {
      config: {
        providers: {
          [KORRI_PORTMASTER_PLUGIN_ID]: {
            legalRisk: "low",
            credentialRequired: false,
            enabledByDefault: false,
          },
        },
        modules: {
          portmaster: {
            id: "portmaster",
            kind: "executable",
            fulfill: {
              provider: "nix",
              installable: ".#portmaster",
              binary: "portmaster",
            },
          },
        },
      },
      handlers: [
        {
          id: "portmaster.claims-search",
          operation: "claims.search",
          capabilities: ["claims.search", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            const query = typeof input.query === "string" ? input.query : ""
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (platform): platform is string =>
                    typeof platform === "string",
                )
              : undefined
            return loadCatalog(runtime).pipe(
              Effect.map(entries =>
                entries
                  .filter(entry => matchesEntry(entry, query, platforms))
                  .slice(0, MAX_SEARCH_RESULTS)
                  .map(entry => candidateFor(entry, context.provider)),
              ),
            )
          },
        },
        {
          id: "portmaster.claims-details",
          operation: "claims.details",
          capabilities: ["claims.details", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            const id = normalizePortmasterId(stringField(input, "id"))
            return loadCatalog(runtime).pipe(
              Effect.flatMap(entries => {
                const entry = entries.find(candidate => candidate.id === id)
                return entry
                  ? Effect.succeed(detailsFor(entry, context.provider))
                  : Effect.fail(
                      new AcquisitionError({
                        reason: "caller",
                        providerId: context.provider,
                        message: `Unknown PortMaster catalog entry: ${id}`,
                      }),
                    )
              }),
            )
          },
        },
        {
          id: "portmaster.claims-parse-url",
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            return typeof input.url === "string"
              ? parsePortmasterUrl(input.url)
              : null
          },
        },
        {
          id: "portmaster.provider-validate",
          operation: "provider.validate",
          capabilities: ["provider.validate", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            return loadCatalog(runtime).pipe(
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
          id: "portmaster.artifact-resolve-download",
          operation: "artifact.resolve-download",
          capabilities: ["artifact.resolve-download", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            const candidateUrl = stringField(input, "candidateUrl")
            const id = parsePortmasterUrl(candidateUrl)
            if (!id) {
              return {
                _tag: "NonFinalDownload" as const,
                providerId: context.provider,
                reason: "unsupported" as const,
                url: candidateUrl,
              } satisfies DownloadResolution
            }

            return loadCatalog(runtime).pipe(
              Effect.map(entries => {
                const entry = entries.find(candidate => candidate.id === id)
                if (!entry) {
                  return {
                    _tag: "FailedDownload" as const,
                    providerId: context.provider,
                    reason: "not-found" as const,
                    message: `Unknown PortMaster catalog entry: ${id}`,
                  } satisfies DownloadResolution
                }

                if (!entry.readyToRun) {
                  return {
                    _tag: "FailedDownload" as const,
                    providerId: context.provider,
                    reason: "not-found" as const,
                    message: "PortMaster entry is not ready-to-run",
                  } satisfies DownloadResolution
                }

                if (!entry.downloadUrl) {
                  return {
                    _tag: "NonFinalDownload" as const,
                    providerId: context.provider,
                    reason: "unsupported" as const,
                    url: candidateUrl,
                  } satisfies DownloadResolution
                }

                return {
                  _tag: "FinalDownload" as const,
                  providerId: context.provider,
                  url: entry.downloadUrl,
                  filename: entry.id,
                  contentType: CONTENT_TYPE,
                } satisfies DownloadResolution
              }),
            )
          },
        },
        {
          id: "portmaster.install",
          operation: "portmaster.install",
          capabilities: ["portmaster.install", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            const id = normalizePortmasterId(stringField(input, "id"))
            const installRoot =
              stringValue(input.installRoot) ?? runtime.installRoot
            const installedAt = stringValue(input.installedAt)

            return loadCatalog(runtime).pipe(
              Effect.flatMap(entries => {
                const entry = entries.find(candidate => candidate.id === id)
                if (!entry) {
                  return Effect.fail(
                    new AcquisitionError({
                      reason: "caller",
                      providerId: context.provider,
                      message: `Unknown PortMaster catalog entry: ${id}`,
                    }),
                  )
                }
                if (!entry.downloadUrl) {
                  return Effect.fail(
                    new AcquisitionError({
                      reason: "provider",
                      providerId: context.provider,
                      message: `PortMaster catalog entry has no download URL: ${id}`,
                    }),
                  )
                }

                const nativeElfRepair =
                  nativeElfRepairFromInput(input.nativeElfRepair) ??
                  runtime.nativeElfRepair
                const fexWrapper =
                  fexWrapperFromInput(input.fexWrapper) ?? runtime.fexWrapper
                const armhfQemuWrapper =
                  armhfQemuWrapperFromInput(input.armhfQemuWrapper) ??
                  runtime.armhfQemuWrapper
                const inlineCompatibility = compatibilityFromInput(
                  input.compatibility,
                )

                return loadCompatibilityDb(runtime).pipe(
                  Effect.flatMap(compatibilityDb =>
                    Effect.tryPromise({
                      try: () =>
                        installPortMasterEntry({
                          providerId: context.provider,
                          id: entry.id,
                          title: entry.title,
                          downloadUrl: entry.downloadUrl,
                          ...(entry.md5 ? { md5: entry.md5 } : {}),
                          ...(entry.size !== undefined
                            ? { size: entry.size }
                            : {}),
                          items: entry.items,
                          arch: entry.arch,
                          runtime: entry.runtime,
                          readyToRun: entry.readyToRun,
                          installRoot,
                          fetchImpl: runtime.fetchImpl,
                          ...(nativeElfRepair ? { nativeElfRepair } : {}),
                          ...(fexWrapper ? { fexWrapper } : {}),
                          ...(armhfQemuWrapper ? { armhfQemuWrapper } : {}),
                          compatibility:
                            inlineCompatibility ??
                            compatibilityDb.get(entry.id),
                          ...(installedAt ? { installedAt } : {}),
                        }),
                      catch: error =>
                        new AcquisitionError({
                          reason: "provider",
                          providerId: context.provider,
                          message: `Failed to install PortMaster entry ${id}: ${
                            error instanceof Error
                              ? error.message
                              : String(error)
                          }`,
                        }),
                    }),
                  ),
                )
              }),
            )
          },
        },
        {
          id: "portmaster.prepare-launch",
          operation: "portmaster.prepare-launch",
          capabilities: ["portmaster.prepare-launch", "portmaster"],
          run: context => {
            const input = readRecord(context.input)
            return Effect.tryPromise({
              try: () =>
                preparePortMasterLaunchEnvelope({
                  manifestPath: stringValue(input.manifestPath),
                  launchScript: stringValue(input.launchScript),
                  deviceArch: stringValue(input.deviceArch),
                  shellPath: stringValue(input.shellPath),
                  bwrapPath: stringValue(input.bwrapPath),
                  envPath: stringValue(input.envPath),
                  useBubblewrap: booleanValue(input.useBubblewrap),
                  presentation: presentationFromInput(input.presentation),
                  inputCompatibility: inputCompatibilityFromInput(
                    input.inputCompatibility,
                  ),
                  runtimeCompatibility: runtimeCompatibilityFromInput(
                    input.runtimeCompatibility,
                  ),
                }),
              catch: error =>
                new AcquisitionError({
                  reason: "provider",
                  providerId: context.provider,
                  message: `Failed to prepare PortMaster launch envelope: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                }),
            })
          },
        },
        {
          id: "portmaster.diagnostics",
          operation: "diagnostics.collect",
          capabilities: ["portmaster"],
          run: context => ({ provider: context.provider, status: "ok" }),
        },
      ],
    },
  })
}

export const portmasterPlugin = createPortMasterPlugin()

function createRuntime(options: PortMasterPluginOptions): PortMasterRuntime {
  return {
    catalogUrl: options.catalogUrl ?? DEFAULT_CATALOG_URL,
    catalogPath:
      options.catalogPath ?? process.env.KORRI_PORTMASTER_CATALOG_PATH,
    fetchImpl: options.fetchImpl ?? fetch,
    readFileText:
      options.readFileText ??
      (async path => readFile(path, { encoding: "utf8" })),
    installRoot: options.installRoot ?? defaultInstallRoot(),
    compatibilityPath:
      options.compatibilityPath ??
      process.env.KORRI_PORTMASTER_COMPATIBILITY_PATH,
    compatibility: options.compatibility,
    ...(options.nativeElfRepair
      ? { nativeElfRepair: options.nativeElfRepair }
      : {}),
    ...(options.fexWrapper ? { fexWrapper: options.fexWrapper } : {}),
    ...(options.armhfQemuWrapper
      ? { armhfQemuWrapper: options.armhfQemuWrapper }
      : {}),
  }
}

function defaultInstallRoot(): string {
  const dataHome =
    process.env.XDG_DATA_HOME ??
    (process.env.HOME ? join(process.env.HOME, ".local", "share") : "/tmp")
  return join(dataHome, "korri", "portmaster")
}

function loadCatalog(
  runtime: PortMasterRuntime,
): Effect.Effect<readonly PortMasterEntry[], AcquisitionError> {
  runtime.catalog ??= loadCatalogJson(runtime).then(parseCatalog)
  return Effect.tryPromise({
    try: () => runtime.catalog as Promise<readonly PortMasterEntry[]>,
    catch: error =>
      new AcquisitionError({
        reason: "provider",
        providerId: KORRI_PORTMASTER_PLUGIN_ID,
        message: `Failed to load PortMaster catalog: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  })
}

async function loadCatalogJson(runtime: PortMasterRuntime): Promise<unknown> {
  if (runtime.catalogPath) {
    return JSON.parse(await runtime.readFileText(runtime.catalogPath))
  }

  const response = await runtime.fetchImpl(runtime.catalogUrl)
  if (!response.ok) {
    throw new Error(`GET ${runtime.catalogUrl} returned ${response.status}`)
  }
  return response.json()
}

function parseCatalog(raw: unknown): readonly PortMasterEntry[] {
  if (!isRecord(raw)) return []
  const ports = isRecord(raw.ports) ? raw.ports : raw
  return Object.entries(ports)
    .map(([key, value]) => parseEntry(key, value))
    .filter((entry): entry is PortMasterEntry => entry !== null)
    .sort((left, right) => left.title.localeCompare(right.title))
}

function parseEntry(key: string, value: unknown): PortMasterEntry | null {
  if (!isRecord(value)) return null
  const raw = value as RawPortMasterEntry
  const attr = isRecord(raw.attr) ? raw.attr : {}
  const source = isRecord(raw.source) ? raw.source : {}
  const id = normalizePortmasterId(stringValue(raw.name) ?? key)
  const title = stringValue(attr.title) ?? id.replace(/\.zip$/i, "")
  const description = stringValue(attr.desc_md) ?? stringValue(attr.desc)
  const instructions = stringValue(attr.inst_md) ?? stringValue(attr.inst)
  const genres = stringArray(attr.genres)
  const porters = stringArray(attr.porter)
  const runtime = stringArray(attr.runtime)
  const reqs = stringArray(attr.reqs)
  const arch = stringArray(attr.arch)
  const items = stringArray(raw.items)
  const readyToRun = attr.rtr === true
  const experimental = attr.exp === true
  const availability = stringValue(attr.availability)
  const downloadUrl = stringValue(source.url)
  const size = numberValue(source.size)
  const md5 = stringValue(source.md5)

  return {
    id,
    title,
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    genres,
    porters,
    runtime,
    reqs,
    arch,
    items,
    readyToRun,
    experimental,
    ...(availability ? { availability } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(md5 ? { md5 } : {}),
    searchText: [
      id,
      title,
      description,
      instructions,
      availability,
      ...genres,
      ...porters,
      ...runtime,
      ...reqs,
      ...arch,
      readyToRun ? "ready-to-run" : "not-ready-to-run",
      experimental ? "experimental" : "stable",
      "portmaster",
      PLATFORM,
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLowerCase(),
  }
}

function candidateFor(
  entry: PortMasterEntry,
  providerId: ProviderId,
): ProviderClaim {
  return {
    _tag: "ProviderClaim",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: detailUrlFor(entry.id),
    platform: PLATFORM,
    playable: playableFor(entry, providerId),
  }
}

function detailsFor(
  entry: PortMasterEntry,
  providerId: ProviderId,
): ProviderClaimDetails {
  const description = [entry.description, entry.instructions]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join("\n\n")

  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: detailUrlFor(entry.id),
    ...(description ? { description } : {}),
    ...(entry.downloadUrl ? { downloadPageUrl: entry.downloadUrl } : {}),
    playable: playableFor(entry, providerId),
    facets: {
      ...(entry.genres.length > 0 ? { genres: entry.genres } : {}),
      tags: [
        ...(entry.readyToRun ? ["ready-to-run"] : ["requires-game-data"]),
        ...(entry.experimental ? ["experimental"] : []),
        ...entry.runtime.map(runtime => `runtime:${runtime}`),
        ...entry.arch.map(arch => `arch:${arch}`),
      ],
    },
  }
}

function playableFor(entry: PortMasterEntry, providerId: ProviderId) {
  return {
    id: entry.id.replace(/\.zip$/i, ""),
    title: entry.title,
    providerId,
    releases: [
      {
        id: PLATFORM,
        providerId,
        system: PLATFORM,
        display: {
          readyToRun: entry.readyToRun,
          availability: entry.availability,
          runtime: entry.runtime,
          arch: entry.arch,
          size: entry.size,
          md5: entry.md5,
        },
      },
    ],
  }
}

function matchesEntry(
  entry: PortMasterEntry,
  query: string,
  platforms: readonly string[] | undefined,
) {
  if (platforms && platforms.length > 0 && !platforms.includes(PLATFORM)) {
    return false
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return normalizedQuery
    .split(/\s+/g)
    .every(term => entry.searchText.includes(term))
}

function parsePortmasterUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url) return null
  if (url.hostname === "portmaster.games" && url.pathname === "/detail.html") {
    return normalizePortmasterId(url.searchParams.get("name"))
  }

  const release = url.pathname.match(
    /^\/PortsMaster\/(?:PortMaster-New|PortMaster-Games)\/releases\/download\/[^/]+\/([^/]+\.zip)$/,
  )
  if (url.hostname === "github.com" && release?.[1]) {
    return normalizePortmasterId(decodeURIComponent(release[1]))
  }
  return null
}

function detailUrlFor(id: string) {
  return `${DETAIL_BASE_URL}${encodeURIComponent(id.replace(/\.zip$/i, ""))}`
}

function normalizePortmasterId(id: string | null | undefined) {
  const normalized = (id ?? "").trim()
  if (!normalized) return ""
  return normalized.endsWith(".zip") ? normalized : `${normalized}.zip`
}

function parseUrl(input: string) {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(input: Record<string, unknown>, field: string) {
  const value = input[field]
  if (typeof value !== "string" || value.trim() === "") {
    throw new AcquisitionError({
      reason: "caller",
      providerId: KORRI_PORTMASTER_PLUGIN_ID,
      message: `${field} is required`,
    })
  }
  return value
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function positiveIntegerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function nativeElfRepairFromInput(
  value: unknown,
): PortMasterNativeElfRepairOptions | undefined {
  const record = readRecord(value)
  const arch = stringValue(record.arch)
  if (
    arch !== "aarch64" &&
    arch !== "armhf" &&
    arch !== "x86" &&
    arch !== "x86_64"
  ) {
    return undefined
  }
  const interpreter = stringValue(record.interpreter)
  const patchelfPath = stringValue(record.patchelfPath)
  const libraryPaths = stringArray(record.libraryPaths)
  if (!interpreter || !patchelfPath || libraryPaths.length === 0) {
    return undefined
  }
  return { arch, interpreter, patchelfPath, libraryPaths }
}

function loadCompatibilityDb(
  runtime: PortMasterRuntime,
): Effect.Effect<
  ReadonlyMap<string, PortMasterCompatibilityProfile>,
  AcquisitionError
> {
  runtime.compatibilityDb ??=
    loadCompatibilityJson(runtime).then(parseCompatibilityDb)
  return Effect.tryPromise({
    try: () =>
      runtime.compatibilityDb as Promise<
        ReadonlyMap<string, PortMasterCompatibilityProfile>
      >,
    catch: error =>
      new AcquisitionError({
        reason: "provider",
        providerId: KORRI_PORTMASTER_PLUGIN_ID,
        message: `Failed to load PortMaster compatibility DB: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  })
}

async function loadCompatibilityJson(
  runtime: PortMasterRuntime,
): Promise<unknown> {
  if (runtime.compatibilityPath) {
    return JSON.parse(await runtime.readFileText(runtime.compatibilityPath))
  }
  return runtime.compatibility ?? {}
}

function parseCompatibilityDb(
  raw: unknown,
): ReadonlyMap<string, PortMasterCompatibilityProfile> {
  const records = readRecord(raw)
  return new Map(
    Object.entries(records).flatMap(([id, value]) => {
      const profile = compatibilityFromInput(value)
      return profile ? [[normalizePortmasterId(id), profile] as const] : []
    }),
  )
}

function compatibilityFromInput(
  value: unknown,
): PortMasterCompatibilityProfile | undefined {
  const record = readRecord(value)
  const launchScript = stringValue(record.launchScript)
  const deviceArch = stringValue(record.deviceArch)
  const env = stringRecord(record.env)
  const runtimeCompatibility = runtimeCompatibilityFromInput(
    record.runtimeCompatibility,
  )
  const inputCompatibility = inputCompatibilityFromInput(
    record.inputCompatibility,
  )
  const presentation = presentationFromInput(record.presentation)
  if (
    !launchScript &&
    !deviceArch &&
    !env &&
    !runtimeCompatibility &&
    !inputCompatibility &&
    !presentation
  ) {
    return undefined
  }
  return {
    ...(launchScript ? { launchScript } : {}),
    ...(deviceArch ? { deviceArch } : {}),
    ...(env ? { env } : {}),
    ...(runtimeCompatibility ? { runtimeCompatibility } : {}),
    ...(inputCompatibility ? { inputCompatibility } : {}),
    ...(presentation ? { presentation } : {}),
  }
}

function runtimeCompatibilityFromInput(
  value: unknown,
): PortMasterLaunchRuntimeCompatibilityInput | undefined {
  const record = readRecord(value)
  const mode = stringValue(record.mode)
  if (
    mode !== "none" &&
    mode !== "retroarch-libretro" &&
    mode !== "runtime-mounts"
  ) {
    return undefined
  }
  const retroarchPath = stringValue(record.retroarchPath)
  const retroarchLogPath = stringValue(record.retroarchLogPath)
  const runtimeMounts = runtimeMountsFromInput(record.runtimeMounts)
  return {
    mode,
    ...(retroarchPath ? { retroarchPath } : {}),
    ...(retroarchLogPath ? { retroarchLogPath } : {}),
    ...(runtimeMounts.length > 0 ? { runtimeMounts } : {}),
  }
}

function runtimeMountsFromInput(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const record = readRecord(item)
    const runtime = stringValue(record.runtime)?.replace(/\.squashfs$/i, "")
    const sourcePath = stringValue(record.sourcePath)
    return runtime && sourcePath ? [{ runtime, sourcePath }] : []
  })
}

function inputCompatibilityFromInput(
  value: unknown,
): PortMasterLaunchInputCompatibilityInput | undefined {
  const record = readRecord(value)
  const mode = stringValue(record.mode)
  if (mode !== "none" && mode !== "sdl-gamecontroller" && mode !== "gptokeyb") {
    return undefined
  }
  const sdlGameControllerConfig = stringValue(record.sdlGameControllerConfig)
  const gptokeybPath = stringValue(record.gptokeybPath)
  const gptokeybLoaderPath = stringValue(record.gptokeybLoaderPath)
  const gptokeybLogPath = stringValue(record.gptokeybLogPath)
  const bindRealUinput = booleanValue(record.bindRealUinput)
  return {
    mode,
    ...(sdlGameControllerConfig ? { sdlGameControllerConfig } : {}),
    ...(gptokeybPath ? { gptokeybPath } : {}),
    ...(gptokeybLoaderPath ? { gptokeybLoaderPath } : {}),
    ...(gptokeybLogPath ? { gptokeybLogPath } : {}),
    ...(bindRealUinput !== undefined ? { bindRealUinput } : {}),
  }
}

function presentationFromInput(
  value: unknown,
): PortMasterLaunchPresentationInput | undefined {
  const record = readRecord(value)
  const mode = stringValue(record.mode)
  if (mode !== "none" && mode !== "sway-fullscreen" && mode !== "gamescope") {
    return undefined
  }
  const swaymsgPath = stringValue(record.swaymsgPath)
  const windowMatcher = stringValue(record.windowMatcher)
  const windowProbe = stringValue(record.windowProbe)
  const logPath = stringValue(record.logPath)
  const startupPollAttempts = positiveIntegerValue(record.startupPollAttempts)
  const startupPollDelayMs = positiveIntegerValue(record.startupPollDelayMs)
  const gamescopePath = stringValue(record.gamescopePath)
  const gamescopeArgs = stringArray(record.gamescopeArgs)
  const gamescopeWidth = positiveIntegerValue(record.gamescopeWidth)
  const gamescopeHeight = positiveIntegerValue(record.gamescopeHeight)
  const gamescopeNestedWidth = positiveIntegerValue(record.gamescopeNestedWidth)
  const gamescopeNestedHeight = positiveIntegerValue(
    record.gamescopeNestedHeight,
  )
  const gamescopeFullscreen = booleanValue(record.gamescopeFullscreen)
  const gamescopeChildWaylandDisplay = stringValue(
    record.gamescopeChildWaylandDisplay,
  )
  const gamescopeChildDisplay = stringValue(record.gamescopeChildDisplay)
  const gamescopeChildSdlVideoDriver = stringValue(
    record.gamescopeChildSdlVideoDriver,
  )
  return {
    mode,
    ...(swaymsgPath ? { swaymsgPath } : {}),
    ...(windowMatcher ? { windowMatcher } : {}),
    ...(windowProbe ? { windowProbe } : {}),
    ...(logPath ? { logPath } : {}),
    ...(startupPollAttempts !== undefined ? { startupPollAttempts } : {}),
    ...(startupPollDelayMs !== undefined ? { startupPollDelayMs } : {}),
    ...(gamescopePath ? { gamescopePath } : {}),
    ...(gamescopeArgs.length > 0 ? { gamescopeArgs } : {}),
    ...(gamescopeWidth !== undefined ? { gamescopeWidth } : {}),
    ...(gamescopeHeight !== undefined ? { gamescopeHeight } : {}),
    ...(gamescopeNestedWidth !== undefined ? { gamescopeNestedWidth } : {}),
    ...(gamescopeNestedHeight !== undefined ? { gamescopeNestedHeight } : {}),
    ...(gamescopeFullscreen !== undefined ? { gamescopeFullscreen } : {}),
    ...(gamescopeChildWaylandDisplay ? { gamescopeChildWaylandDisplay } : {}),
    ...(gamescopeChildDisplay !== undefined ? { gamescopeChildDisplay } : {}),
    ...(gamescopeChildSdlVideoDriver ? { gamescopeChildSdlVideoDriver } : {}),
  }
}

function armhfQemuWrapperFromInput(
  value: unknown,
): PortMasterArmhfQemuWrapperOptions | undefined {
  const record = readRecord(value)
  const qemuArmPath = stringValue(record.qemuArmPath)
  const rootfs = stringValue(record.rootfs)
  if (!qemuArmPath || !rootfs) return undefined
  const libraryPaths = stringArray(record.libraryPaths)
  const env = stringRecord(record.env)
  return {
    qemuArmPath,
    rootfs,
    ...(libraryPaths.length > 0 ? { libraryPaths } : {}),
    ...(env ? { env } : {}),
  }
}

function fexWrapperFromInput(
  value: unknown,
): PortMasterFexWrapperOptions | undefined {
  const record = readRecord(value)
  const arch = stringValue(record.arch)
  if (arch !== "x86" && arch !== "x86_64") return undefined
  const fexPath = stringValue(record.fexPath)
  const rootfs = stringValue(record.rootfs)
  if (!fexPath || !rootfs) return undefined
  const setupEnvPath = stringValue(record.setupEnvPath)
  const appId = stringValue(record.appId)
  const runDir = stringValue(record.runDir)
  const env = stringRecord(record.env)
  return {
    arch,
    fexPath,
    rootfs,
    ...(setupEnvPath ? { setupEnvPath } : {}),
    ...(appId ? { appId } : {}),
    ...(runDir ? { runDir } : {}),
    ...(env ? { env } : {}),
  }
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

function stringRecord(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  const record = readRecord(value)
  const entries = Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
