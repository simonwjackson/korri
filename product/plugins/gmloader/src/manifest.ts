import type { ProviderId } from "@platform/plugin"
import type { GmloaderPayloadProfile } from "./payload"

export const GMLOADER_MANIFEST_SCHEMA_VERSION = 1
export const GMLOADER_RELEASE_ID = "installed"
export const GMLOADER_SYSTEM_ID = "gmloader"

export interface GmloaderInstalledFile {
  readonly path: string
  readonly sizeBytes: number
}

export interface GmloaderInstalledManifest {
  readonly schemaVersion: 1
  readonly providerId: ProviderId
  readonly id: string
  readonly title: string
  readonly installedAt: string
  readonly installRoot: string
  readonly gameRoot: string
  readonly manifestPath: string
  readonly source: {
    readonly path: string
    readonly sizeBytes: number
    readonly sha256: string
    readonly idStrategy: "content-hash"
  }
  readonly payload: GmloaderPayloadProfile
  readonly run: {
    readonly configPath: string
    readonly files: readonly GmloaderInstalledFile[]
    readonly libraryPaths: readonly string[]
  }
  readonly compatibility: GmloaderCompatibilityProfile
}

export interface GmloaderCompatibilityProfile {
  readonly env?: Readonly<Record<string, string>>
  readonly limitations?: readonly string[]
  readonly transformsApplied: readonly string[]
}

export function decodeGmloaderInstalledManifest(
  input: unknown,
  expectedProviderId?: ProviderId,
): GmloaderInstalledManifest | null {
  if (!isRecord(input)) return null
  if (input.schemaVersion !== GMLOADER_MANIFEST_SCHEMA_VERSION) return null
  if (expectedProviderId && input.providerId !== expectedProviderId) return null
  if (typeof input.providerId !== "string") return null
  if (typeof input.id !== "string") return null
  if (typeof input.title !== "string") return null
  if (typeof input.installedAt !== "string") return null
  if (typeof input.installRoot !== "string") return null
  if (typeof input.gameRoot !== "string") return null
  if (typeof input.manifestPath !== "string") return null
  if (!isRecord(input.source)) return null
  if (typeof input.source.path !== "string") return null
  if (typeof input.source.sizeBytes !== "number") return null
  if (typeof input.source.sha256 !== "string") return null
  if (input.source.idStrategy !== "content-hash") return null
  if (!isRecord(input.payload)) return null
  if (!isRecord(input.run)) return null
  if (typeof input.run.configPath !== "string") return null
  if (!Array.isArray(input.run.files)) return null
  if (!Array.isArray(input.run.libraryPaths)) return null
  if (!isRecord(input.compatibility)) return null
  if (!Array.isArray(input.compatibility.transformsApplied)) return null
  return input as unknown as GmloaderInstalledManifest
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null
}
