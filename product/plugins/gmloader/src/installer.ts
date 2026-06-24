import { createHash, randomUUID } from "node:crypto"
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import { dirname, join, resolve } from "node:path"
import {
  readZipCentralDirectory,
  readZipEntryBytes,
  type ZipCentralDirectoryEntry,
} from "@platform/archive/zip"
import type { ProviderId } from "@platform/plugin"
import { createGmloaderJson } from "./gmloader-json"
import {
  decodeGmloaderInstalledManifest,
  type GmloaderCompatibilityProfile,
  type GmloaderInstalledFile,
  type GmloaderInstalledManifest,
} from "./manifest"
import {
  type GmloaderPayloadProfile,
  type GmloaderPayloadRejection,
  inspectGmloaderPayload,
} from "./payload"

export const GMLOADER_READY_MARKER = ".korri-gmloader-ready" as const
const GMLOADER_RUNTIME_APK_PATH = "game.apk" as const
const GMLOADER_REQUIRED_SHIM_LIBRARIES = [
  "libm.so",
  "libcompiler_rt.so",
  "libc++_shared.so",
] as const

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
  readonly shimLibraryRoot?: string
}

export interface EnsureGmloaderPayloadInstalledResult {
  readonly manifest: GmloaderInstalledManifest
  readonly status: "cache-hit" | "materialized"
}

interface PreparedGmloaderInstall {
  readonly input: InstallGmloaderPayloadInput
  readonly profile: GmloaderPayloadProfile
  readonly sourceDigest: {
    readonly sha256: string
    readonly sizeBytes: number
  }
  readonly id: string
  readonly installRoot: string
  readonly gameRoot: string
  readonly manifestPath: string
}

const installLocks = new Map<string, Promise<unknown>>()

export async function installGmloaderPayload(
  input: InstallGmloaderPayloadInput,
): Promise<GmloaderInstalledManifest> {
  const prepared = await prepareGmloaderInstall(input)
  return withInstallLock(prepared.id, async () => {
    if (!input.overwrite && (await exists(prepared.gameRoot))) {
      throw new Error(
        `GMLoader install already exists for ${prepared.id}; pass overwrite to replace it`,
      )
    }
    return withFileInstallLock(prepared, async () => {
      if (!input.overwrite && (await exists(prepared.gameRoot))) {
        throw new Error(
          `GMLoader install already exists for ${prepared.id}; pass overwrite to replace it`,
        )
      }
      return materializePreparedGmloaderInstall(prepared, {
        replaceExisting: input.overwrite === true,
      })
    })
  })
}

export async function ensureGmloaderPayloadInstalled(
  input: InstallGmloaderPayloadInput,
): Promise<EnsureGmloaderPayloadInstalledResult> {
  const prepared = await prepareGmloaderInstall(input)
  return withInstallLock(prepared.id, async () => {
    if (!input.overwrite) {
      const existing = await readCompleteInstalledManifest(prepared)
      if (existing) return { manifest: existing, status: "cache-hit" as const }
    }
    return withFileInstallLock(prepared, async () => {
      if (!input.overwrite) {
        const existing = await readCompleteInstalledManifest(prepared)
        if (existing)
          return { manifest: existing, status: "cache-hit" as const }
      }
      const manifest = await materializePreparedGmloaderInstall(prepared, {
        replaceExisting: true,
      })
      return { manifest, status: "materialized" as const }
    })
  })
}

async function prepareGmloaderInstall(
  input: InstallGmloaderPayloadInput,
): Promise<PreparedGmloaderInstall> {
  const inspection = await inspectGmloaderPayload({
    sourcePath: input.sourcePath,
  })
  if (inspection._tag === "Rejected")
    throw new GmloaderInstallRejected(inspection.rejection)

  const profile = inspection.profile
  const sourceDigest = await digestPayloadSource(profile)
  const id = `${profile.idHint}-${sourceDigest.sha256.slice(0, 12)}`
  const installRoot = resolve(input.installRoot)
  const gameRoot = join(installRoot, "games", id)
  const manifestPath = join(installRoot, "manifests", `${id}.json`)
  return {
    input,
    profile,
    sourceDigest,
    id,
    installRoot,
    gameRoot,
    manifestPath,
  }
}

async function materializePreparedGmloaderInstall(
  prepared: PreparedGmloaderInstall,
  options: { readonly replaceExisting: boolean },
): Promise<GmloaderInstalledManifest> {
  const tmpRoot = `${prepared.gameRoot}.tmp-${process.pid}-${randomUUID()}`
  let staleRoot: string | undefined
  let publishedRoot = false
  await rm(tmpRoot, { recursive: true, force: true })
  await mkdir(tmpRoot, { recursive: true })

  try {
    const installedFiles: GmloaderInstalledFile[] = []
    await copyPayloadAsApk(
      prepared.profile,
      join(tmpRoot, GMLOADER_RUNTIME_APK_PATH),
      installedFiles,
    )
    await copyPayloadFile(
      prepared.profile,
      "assets/game.droid",
      join(tmpRoot, "assets", "game.droid"),
      installedFiles,
    )
    await copyPayloadFile(
      prepared.profile,
      "lib/arm64-v8a/libyoyo.so",
      join(tmpRoot, "lib", "arm64-v8a", "libyoyo.so"),
      installedFiles,
    )
    const installedSupportPaths = new Set<string>()
    for (const support of prepared.profile.supportLibraries) {
      await copyPayloadFile(
        prepared.profile,
        support.path,
        join(tmpRoot, support.path),
        installedFiles,
      )
      installedSupportPaths.add(support.path)
    }
    await seedShimLibraries({
      shimLibraryRoot: prepared.input.shimLibraryRoot,
      targetRoot: tmpRoot,
      installed: installedFiles,
      existingPaths: installedSupportPaths,
    })
    const configPath = join(tmpRoot, "gmloader.json")
    const gmloaderJson = createGmloaderJson({
      apkPath: GMLOADER_RUNTIME_APK_PATH,
    })
    await writeFile(configPath, gmloaderJson)
    installedFiles.push({
      path: "gmloader.json",
      sizeBytes: Buffer.byteLength(gmloaderJson),
    })

    const compatibility: GmloaderCompatibilityProfile = {
      transformsApplied: prepared.profile.transformsRequired,
      ...(prepared.input.compatibility?.env
        ? { env: prepared.input.compatibility.env }
        : {}),
      ...(prepared.input.compatibility?.limitations
        ? { limitations: prepared.input.compatibility.limitations }
        : {}),
    }
    const compatibilityJson = `${JSON.stringify(compatibility, null, 2)}\n`
    await writeFile(
      join(tmpRoot, "compatibility-profile.json"),
      compatibilityJson,
    )
    installedFiles.push({
      path: "compatibility-profile.json",
      sizeBytes: Buffer.byteLength(compatibilityJson),
    })
    await writeFile(
      join(tmpRoot, GMLOADER_READY_MARKER),
      `${prepared.sourceDigest.sha256}\n`,
    )

    await mkdir(dirname(prepared.gameRoot), { recursive: true })
    if (options.replaceExisting && (await exists(prepared.gameRoot))) {
      staleRoot = `${prepared.gameRoot}.stale-${process.pid}-${randomUUID()}`
      await rm(staleRoot, { recursive: true, force: true })
      await rename(prepared.gameRoot, staleRoot)
    }
    await rename(tmpRoot, prepared.gameRoot)
    publishedRoot = true

    const manifest: GmloaderInstalledManifest = {
      schemaVersion: 1,
      providerId: prepared.input.providerId,
      id: prepared.id,
      title: prepared.input.title ?? prepared.profile.title,
      installedAt: prepared.input.installedAt ?? new Date().toISOString(),
      installRoot: prepared.installRoot,
      gameRoot: prepared.gameRoot,
      manifestPath: prepared.manifestPath,
      source: {
        path: prepared.profile.sourcePath,
        sizeBytes: prepared.sourceDigest.sizeBytes,
        sha256: prepared.sourceDigest.sha256,
        idStrategy: "content-hash",
      },
      payload: prepared.profile,
      run: {
        configPath: join(prepared.gameRoot, "gmloader.json"),
        files: installedFiles.sort((left, right) =>
          left.path.localeCompare(right.path),
        ),
        libraryPaths: [
          join(prepared.gameRoot, "lib", "arm64-v8a"),
          join(prepared.gameRoot, "lib"),
        ],
      },
      compatibility,
    }

    await writeManifestAtomic(prepared.manifestPath, manifest)
    if (staleRoot) await rm(staleRoot, { recursive: true, force: true })
    return manifest
  } catch (error) {
    await rm(tmpRoot, { recursive: true, force: true })
    if (publishedRoot)
      await rm(prepared.gameRoot, { recursive: true, force: true })
    if (
      staleRoot &&
      (await exists(staleRoot)) &&
      !(await exists(prepared.gameRoot))
    ) {
      await rename(staleRoot, prepared.gameRoot)
    }
    throw error
  }
}

async function readCompleteInstalledManifest(
  prepared: PreparedGmloaderInstall,
): Promise<GmloaderInstalledManifest | undefined> {
  try {
    const manifest = decodeGmloaderInstalledManifest(
      JSON.parse(await readFile(prepared.manifestPath, "utf8")),
      prepared.input.providerId,
    )
    if (!manifest) return undefined
    if (manifest.id !== prepared.id) return undefined
    if (manifest.source.sha256 !== prepared.sourceDigest.sha256) {
      return undefined
    }
    if (manifest.gameRoot !== prepared.gameRoot) return undefined
    await stat(join(manifest.gameRoot, GMLOADER_READY_MARKER))
    await stat(join(manifest.gameRoot, GMLOADER_RUNTIME_APK_PATH))
    await stat(join(manifest.gameRoot, "assets", "game.droid"))
    await stat(join(manifest.gameRoot, "lib", "arm64-v8a", "libyoyo.so"))
    if (prepared.input.shimLibraryRoot) {
      for (const library of GMLOADER_REQUIRED_SHIM_LIBRARIES) {
        if (await exists(join(prepared.input.shimLibraryRoot, library))) {
          await stat(join(manifest.gameRoot, "lib", "arm64-v8a", library))
        }
      }
    }
    await stat(manifest.run.configPath)
    return manifest
  } catch {
    return undefined
  }
}

async function copyPayloadAsApk(
  profile: GmloaderPayloadProfile,
  target: string,
  installed: GmloaderInstalledFile[],
): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  if (profile.kind === "archive") {
    await copyFile(profile.sourcePath, target)
    const metadata = await stat(target)
    installed.push({
      path: GMLOADER_RUNTIME_APK_PATH,
      sizeBytes: metadata.size,
    })
    return
  }

  const archive = await createStoredPayloadArchive(profile)
  await writeFile(target, archive)
  installed.push({ path: GMLOADER_RUNTIME_APK_PATH, sizeBytes: archive.length })
}

async function seedShimLibraries(input: {
  readonly shimLibraryRoot?: string
  readonly targetRoot: string
  readonly installed: GmloaderInstalledFile[]
  readonly existingPaths: ReadonlySet<string>
}): Promise<void> {
  if (!input.shimLibraryRoot) return
  for (const library of GMLOADER_REQUIRED_SHIM_LIBRARIES) {
    const path = `lib/arm64-v8a/${library}`
    if (input.existingPaths.has(path)) continue
    const source = join(input.shimLibraryRoot, library)
    if (!(await exists(source))) continue
    const target = join(input.targetRoot, path)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
    const metadata = await stat(target)
    input.installed.push({ path, sizeBytes: metadata.size })
  }
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

async function createStoredPayloadArchive(
  profile: GmloaderPayloadProfile,
): Promise<Buffer> {
  const entries = await Promise.all(
    [
      "assets/game.droid",
      "lib/arm64-v8a/libyoyo.so",
      ...profile.supportLibraries.map(file => file.path),
    ].map(async path => ({
      path,
      bytes: await readPayloadFile(profile, path),
    })),
  )
  const fileRecords: Buffer[] = []
  const centralRecords: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.path)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(entry.bytes.length, 18)
    local.writeUInt32LE(entry.bytes.length, 22)
    local.writeUInt16LE(name.length, 26)
    fileRecords.push(local, name, entry.bytes)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(entry.bytes.length, 20)
    central.writeUInt32LE(entry.bytes.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centralRecords.push(central, name)
    offset += local.length + name.length + entry.bytes.length
  }

  const centralOffset = offset
  const central = Buffer.concat(centralRecords)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([...fileRecords, central, eocd])
}

async function readPayloadFile(
  profile: GmloaderPayloadProfile,
  path: string,
): Promise<Buffer> {
  if (profile.kind === "directory")
    return readFile(join(profile.sourcePath, path))
  const archive = await readFile(profile.sourcePath)
  const entry = readZipCentralDirectory(archive).find(
    candidate => candidate.safePath === path,
  )
  if (!entry) throw new Error(`Payload file missing after detection: ${path}`)
  return readZipEntryBytes(archive, entry as ZipCentralDirectoryEntry)
}

async function writeManifestAtomic(
  manifestPath: string,
  manifest: GmloaderInstalledManifest,
): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true })
  const tmp = `${manifestPath}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(tmp, manifestPath)
}

async function digestPayloadSource(
  profile: GmloaderPayloadProfile,
): Promise<{ readonly sha256: string; readonly sizeBytes: number }> {
  const metadata = await stat(profile.sourcePath)
  if (metadata.isFile()) {
    const bytes = await readFile(profile.sourcePath)
    return { sha256: digest("sha256", bytes), sizeBytes: bytes.length }
  }

  const hash = createHash("sha256")
  let sizeBytes = 0
  const paths = [
    "assets/game.droid",
    "lib/arm64-v8a/libyoyo.so",
    ...profile.supportLibraries.map(file => file.path),
  ].sort((left, right) => left.localeCompare(right))
  for (const path of paths) {
    const bytes = await readPayloadFile(profile, path)
    hash.update(path)
    hash.update("\0")
    hash.update(bytes)
    hash.update("\0")
    sizeBytes += bytes.length
  }
  return { sha256: hash.digest("hex"), sizeBytes }
}

function digest(algorithm: "sha256", bytes: Buffer): string {
  return createHash(algorithm).update(bytes).digest("hex")
}

async function withFileInstallLock<T>(
  prepared: PreparedGmloaderInstall,
  run: () => Promise<T>,
): Promise<T> {
  const lockRoot = join(prepared.installRoot, "locks")
  const lockDir = join(lockRoot, `${prepared.id}.lock`)
  await mkdir(lockRoot, { recursive: true })
  await acquireLockDir(lockDir)
  try {
    return await run()
  } finally {
    await rm(lockDir, { recursive: true, force: true })
  }
}

async function acquireLockDir(lockDir: string): Promise<void> {
  const startedAt = Date.now()
  while (true) {
    try {
      await mkdir(lockDir)
      return
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error
      if (Date.now() - startedAt > 30_000) {
        throw new Error(
          `Timed out waiting for GMLoader install lock: ${lockDir}`,
        )
      }
      await sleep(50)
    }
  }
}

function withInstallLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = installLocks.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(run)
  const cleanup = current
    .catch(() => undefined)
    .finally(() => {
      if (installLocks.get(key) === cleanup) installLocks.delete(key)
    })
  installLocks.set(key, cleanup)
  return current
}

function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
