import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import type { ProviderId } from "@platform/plugin"
import {
  readZipCentralDirectory,
  readZipEntryBytes,
  type ZipCentralDirectoryEntry,
} from "@platform/archive/zip"
import { createGmloaderJson } from "./gmloader-json"
import {
  type GmloaderCompatibilityProfile,
  type GmloaderInstalledFile,
  type GmloaderInstalledManifest,
} from "./manifest"
import {
  inspectGmloaderPayload,
  type GmloaderPayloadProfile,
  type GmloaderPayloadRejection,
} from "./payload"

export class GmloaderInstallRejected extends Error {
  readonly rejection: GmloaderPayloadRejection

  constructor(rejection: GmloaderPayloadRejection) {
    super(rejection.message)
    this.name = "GmloaderInstallRejected"
    this.rejection = rejection
  }
}

export interface InstallGmloaderPayloadInput {
  readonly providerId: ProviderId
  readonly sourcePath: string
  readonly installRoot: string
  readonly title?: string
  readonly installedAt?: string
  readonly overwrite?: boolean
  readonly compatibility?: {
    readonly env?: Readonly<Record<string, string>>
    readonly limitations?: readonly string[]
  }
}

export async function installGmloaderPayload(
  input: InstallGmloaderPayloadInput,
): Promise<GmloaderInstalledManifest> {
  const inspection = await inspectGmloaderPayload({ sourcePath: input.sourcePath })
  if (inspection._tag === "Rejected") throw new GmloaderInstallRejected(inspection.rejection)

  const profile = inspection.profile
  const sourceBytes = await sourceDigestBytes(profile.sourcePath)
  const sha256 = digest("sha256", sourceBytes)
  const id = `${profile.idHint}-${sha256.slice(0, 12)}`
  const installRoot = resolve(input.installRoot)
  const gameRoot = join(installRoot, "games", id)
  const manifestPath = join(installRoot, "manifests", `${id}.json`)

  if (!input.overwrite && (await exists(gameRoot))) {
    throw new Error(`GMLoader install already exists for ${id}; pass overwrite to replace it`)
  }

  const tmpRoot = `${gameRoot}.tmp-${process.pid}-${Date.now()}`
  await rm(tmpRoot, { recursive: true, force: true })
  await mkdir(tmpRoot, { recursive: true })

  const installedFiles: GmloaderInstalledFile[] = []
  await copyPayloadFile(profile, "assets/game.droid", join(tmpRoot, "assets", "game.droid"), installedFiles)
  await copyPayloadFile(profile, "lib/arm64-v8a/libyoyo.so", join(tmpRoot, "lib", "arm64-v8a", "libyoyo.so"), installedFiles)
  for (const support of profile.supportLibraries) {
    await copyPayloadFile(profile, support.path, join(tmpRoot, support.path), installedFiles)
  }
  const configPath = join(tmpRoot, "gmloader.json")
  await writeFile(configPath, createGmloaderJson())
  installedFiles.push({ path: "gmloader.json", sizeBytes: Buffer.byteLength(createGmloaderJson()) })

  const compatibility: GmloaderCompatibilityProfile = {
    transformsApplied: profile.transformsRequired,
    ...(input.compatibility?.env ? { env: input.compatibility.env } : {}),
    ...(input.compatibility?.limitations ? { limitations: input.compatibility.limitations } : {}),
  }
  await writeFile(join(tmpRoot, "compatibility-profile.json"), `${JSON.stringify(compatibility, null, 2)}\n`)
  installedFiles.push({
    path: "compatibility-profile.json",
    sizeBytes: Buffer.byteLength(`${JSON.stringify(compatibility, null, 2)}\n`),
  })

  await mkdir(dirname(gameRoot), { recursive: true })
  if (input.overwrite) await rm(gameRoot, { recursive: true, force: true })
  await rename(tmpRoot, gameRoot)

  const manifest: GmloaderInstalledManifest = {
    schemaVersion: 1,
    providerId: input.providerId,
    id,
    title: input.title ?? profile.title,
    installedAt: input.installedAt ?? new Date().toISOString(),
    installRoot,
    gameRoot,
    manifestPath,
    source: {
      path: profile.sourcePath,
      sizeBytes: sourceBytes.length,
      sha256,
      idStrategy: "content-hash",
    },
    payload: profile,
    run: {
      configPath: join(gameRoot, "gmloader.json"),
      files: installedFiles.sort((left, right) => left.path.localeCompare(right.path)),
      libraryPaths: [join(gameRoot, "lib", "arm64-v8a"), join(gameRoot, "lib")],
    },
    compatibility,
  }

  await writeManifestAtomic(manifestPath, manifest)
  return manifest
}

async function copyPayloadFile(
  profile: GmloaderPayloadProfile,
  path: string,
  target: string,
  installed: GmloaderInstalledFile[],
): Promise<void> {
  const bytes = await readPayloadFile(profile, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  installed.push({ path, sizeBytes: bytes.length })
}

async function readPayloadFile(
  profile: GmloaderPayloadProfile,
  path: string,
): Promise<Buffer> {
  if (profile.kind === "directory") return readFile(join(profile.sourcePath, path))
  const archive = await readFile(profile.sourcePath)
  const entry = readZipCentralDirectory(archive).find(candidate => candidate.safePath === path)
  if (!entry) throw new Error(`Payload file missing after detection: ${path}`)
  return readZipEntryBytes(archive, entry as ZipCentralDirectoryEntry)
}

async function writeManifestAtomic(
  manifestPath: string,
  manifest: GmloaderInstalledManifest,
): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true })
  const tmp = `${manifestPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(tmp, manifestPath)
}

async function sourceDigestBytes(sourcePath: string): Promise<Buffer> {
  const metadata = await stat(sourcePath)
  if (metadata.isFile()) return readFile(sourcePath)
  const inspection = await inspectGmloaderPayload({ sourcePath })
  if (inspection._tag === "Rejected") return Buffer.from(sourcePath)
  const hash = createHash("sha256")
  hash.update(inspection.profile.title)
  hash.update(JSON.stringify(inspection.profile.gameDroid))
  hash.update(JSON.stringify(inspection.profile.libyoyo))
  return hash.digest()
}

function digest(algorithm: "sha256", bytes: Buffer): string {
  return createHash(algorithm).update(bytes).digest("hex")
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false)
}
