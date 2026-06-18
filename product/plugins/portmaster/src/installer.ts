import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, dirname, join, normalize, sep } from "node:path"
import { promisify } from "node:util"
import { inflateRawSync } from "node:zlib"
import type { ProviderId } from "@platform/plugin"

const execFileAsync = promisify(execFile)

export type PortMasterBinaryArch = "aarch64" | "armhf" | "x86" | "x86_64"

export type PortMasterCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<void>

export interface PortMasterNativeElfRepairOptions {
  readonly arch: PortMasterBinaryArch
  readonly interpreter: string
  readonly libraryPaths: readonly string[]
  readonly patchelfPath: string
  readonly runCommand?: PortMasterCommandRunner
}

export interface PortMasterNativeElfRepairRecord {
  readonly path: string
  readonly arch: PortMasterBinaryArch
  readonly interpreter: string
  readonly rpath: string
  readonly patchelfPath: string
}

export interface PortMasterInstallInput {
  readonly providerId: ProviderId
  readonly id: string
  readonly title: string
  readonly downloadUrl: string
  readonly md5?: string
  readonly size?: number
  readonly items: readonly string[]
  readonly arch: readonly string[]
  readonly runtime: readonly string[]
  readonly readyToRun: boolean
  readonly installRoot: string
  readonly fetchImpl: typeof fetch
  readonly nativeElfRepair?: PortMasterNativeElfRepairOptions
  readonly installedAt?: string
}

export interface PortMasterInstalledManifest {
  readonly schemaVersion: 1
  readonly providerId: ProviderId
  readonly id: string
  readonly title: string
  readonly installedAt: string
  readonly installRoot: string
  readonly portsRoot: string
  readonly manifestPath: string
  readonly source: {
    readonly url: string
    readonly sizeBytes: number
    readonly md5?: string
    readonly sha256: string
  }
  readonly catalog: {
    readonly items: readonly string[]
    readonly arch: readonly string[]
    readonly runtime: readonly string[]
    readonly readyToRun: boolean
  }
  readonly extracted: {
    readonly files: readonly PortMasterInstalledFile[]
    readonly launchScripts: readonly PortMasterInstalledFile[]
    readonly binaries: readonly PortMasterInstalledBinary[]
    readonly nativeElfRepairs: readonly PortMasterNativeElfRepairRecord[]
  }
}

export interface PortMasterInstalledFile {
  readonly path: string
  readonly sizeBytes: number
}

export interface PortMasterInstalledBinary extends PortMasterInstalledFile {
  readonly format: "elf"
  readonly elfClass: "32" | "64"
  readonly machine: string
  readonly arch?: PortMasterBinaryArch
}

interface ZipEntry {
  readonly path: string
  readonly bytes: Buffer
}

interface CentralDirectoryEntry {
  readonly path: string
  readonly compressionMethod: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly localHeaderOffset: number
}

const ZIP_LOCAL_HEADER = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50
const ZIP_STORED = 0
const ZIP_DEFLATED = 8

export async function installPortMasterEntry(
  input: PortMasterInstallInput,
): Promise<PortMasterInstalledManifest> {
  if (!input.readyToRun) {
    throw new Error(`PortMaster entry is not ready-to-run: ${input.id}`)
  }

  const archive = await fetchArchive(input)
  const md5 = digest("md5", archive)
  if (input.md5 && md5 !== input.md5.toLowerCase()) {
    throw new Error(
      `PortMaster archive md5 mismatch for ${input.id}: expected ${input.md5}, got ${md5}`,
    )
  }

  const portsRoot = join(input.installRoot, "ports")
  await mkdir(portsRoot, { recursive: true })
  for (const item of input.items) {
    await removeCatalogItem(portsRoot, item)
  }

  const extracted = await extractZipArchive(archive, portsRoot)
  let files = await inspectInstalledFiles(portsRoot, extracted)
  let launchScripts = files.filter(file => isLaunchScript(file.path))
  let binaries = await inspectInstalledBinaries(portsRoot, files)

  for (const file of [...launchScripts, ...binaries]) {
    await chmod(join(portsRoot, file.path), 0o755).catch(() => undefined)
  }

  const nativeElfRepairs = await repairNativeElfs({
    portsRoot,
    binaries,
    options: input.nativeElfRepair,
  })
  if (nativeElfRepairs.length > 0) {
    files = await inspectInstalledFiles(portsRoot, extracted)
    launchScripts = files.filter(file => isLaunchScript(file.path))
    binaries = await inspectInstalledBinaries(portsRoot, files)
  }

  const manifest: PortMasterInstalledManifest = {
    schemaVersion: 1,
    providerId: input.providerId,
    id: input.id,
    title: input.title,
    installedAt: input.installedAt ?? new Date().toISOString(),
    installRoot: input.installRoot,
    portsRoot,
    manifestPath: join(
      input.installRoot,
      "manifests",
      `${portSlug(input.id)}.json`,
    ),
    source: {
      url: input.downloadUrl,
      sizeBytes: archive.length,
      ...(input.md5 ? { md5 } : {}),
      sha256: digest("sha256", archive),
    },
    catalog: {
      items: input.items,
      arch: input.arch,
      runtime: input.runtime,
      readyToRun: input.readyToRun,
    },
    extracted: {
      files,
      launchScripts,
      binaries,
      nativeElfRepairs,
    },
  }

  await mkdir(dirname(manifest.manifestPath), { recursive: true })
  await writeFile(
    `${manifest.manifestPath}.tmp`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  await rm(manifest.manifestPath, { force: true })
  await rename(`${manifest.manifestPath}.tmp`, manifest.manifestPath)

  return manifest
}

async function repairNativeElfs(input: {
  readonly portsRoot: string
  readonly binaries: readonly PortMasterInstalledBinary[]
  readonly options?: PortMasterNativeElfRepairOptions
}): Promise<readonly PortMasterNativeElfRepairRecord[]> {
  if (!input.options) return []
  const rpath = input.options.libraryPaths.join(":")
  const runCommand = input.options.runCommand ?? defaultCommandRunner
  const repairs: PortMasterNativeElfRepairRecord[] = []

  for (const binary of input.binaries) {
    if (binary.arch !== input.options.arch) continue
    const target = join(input.portsRoot, binary.path)
    await runCommand(input.options.patchelfPath, [
      "--set-interpreter",
      input.options.interpreter,
      "--set-rpath",
      rpath,
      target,
    ])
    repairs.push({
      path: binary.path,
      arch: input.options.arch,
      interpreter: input.options.interpreter,
      rpath,
      patchelfPath: input.options.patchelfPath,
    })
  }

  return repairs
}

async function defaultCommandRunner(
  command: string,
  args: readonly string[],
): Promise<void> {
  await execFileAsync(command, [...args])
}

async function fetchArchive(input: PortMasterInstallInput): Promise<Buffer> {
  const response = await input.fetchImpl(input.downloadUrl)
  if (!response.ok) {
    throw new Error(
      `PortMaster archive download failed for ${input.id}: HTTP ${response.status}`,
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

async function removeCatalogItem(
  portsRoot: string,
  item: string,
): Promise<void> {
  const safe = safeZipPath(item.replace(/\/+$/g, ""))
  if (!safe) return
  await rm(join(portsRoot, safe), { recursive: true, force: true })
}

async function extractZipArchive(
  archive: Buffer,
  destination: string,
): Promise<readonly string[]> {
  const entries = readZipEntries(archive)
  const extracted: string[] = []
  for (const entry of entries) {
    const safe = safeZipPath(entry.path)
    if (!safe) continue
    const target = join(destination, safe)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, entry.bytes)
    extracted.push(safe)
  }
  return extracted.sort()
}

function readZipEntries(archive: Buffer): readonly ZipEntry[] {
  const centralDirectory = readCentralDirectory(archive)
  return centralDirectory
    .filter(entry => !entry.path.endsWith("/"))
    .map(entry => ({ path: entry.path, bytes: readZipEntry(archive, entry) }))
}

function readCentralDirectory(
  archive: Buffer,
): readonly CentralDirectoryEntry[] {
  const eocdOffset = findEndOfCentralDirectory(archive)
  const entryCount = archive.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16)
  const entries: CentralDirectoryEntry[] = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error(
        "Unsupported or corrupt zip archive: bad central directory",
      )
    }

    const compressionMethod = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const uncompressedSize = archive.readUInt32LE(offset + 24)
    const fileNameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localHeaderOffset = archive.readUInt32LE(offset + 42)
    const fileNameStart = offset + 46
    const path = archive
      .subarray(fileNameStart, fileNameStart + fileNameLength)
      .toString("utf8")

    entries.push({
      path,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })

    offset = fileNameStart + fileNameLength + extraLength + commentLength
  }

  return entries
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minOffset = Math.max(0, archive.length - 65557)
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset
    }
  }
  throw new Error(
    "Unsupported or corrupt zip archive: missing central directory",
  )
}

function readZipEntry(archive: Buffer, entry: CentralDirectoryEntry): Buffer {
  const offset = entry.localHeaderOffset
  if (archive.readUInt32LE(offset) !== ZIP_LOCAL_HEADER) {
    throw new Error(`Unsupported or corrupt zip archive entry: ${entry.path}`)
  }

  const fileNameLength = archive.readUInt16LE(offset + 26)
  const extraLength = archive.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + fileNameLength + extraLength
  const compressed = archive.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  )

  if (entry.compressionMethod === ZIP_STORED) return Buffer.from(compressed)
  if (entry.compressionMethod === ZIP_DEFLATED) {
    const inflated = inflateRawSync(compressed)
    if (inflated.length !== entry.uncompressedSize) {
      throw new Error(`Zip entry size mismatch: ${entry.path}`)
    }
    return inflated
  }

  throw new Error(
    `Unsupported zip compression method ${entry.compressionMethod}: ${entry.path}`,
  )
}

function safeZipPath(path: string): string | null {
  const normalized = normalize(path.replaceAll("\\", "/"))
  if (
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes(`..${sep}`)
  ) {
    return null
  }
  return normalized
}

async function inspectInstalledFiles(
  portsRoot: string,
  paths: readonly string[],
): Promise<readonly PortMasterInstalledFile[]> {
  const files: PortMasterInstalledFile[] = []
  for (const path of paths) {
    const target = join(portsRoot, path)
    const metadata = await stat(target).catch(() => null)
    if (metadata?.isFile()) files.push({ path, sizeBytes: metadata.size })
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function inspectInstalledBinaries(
  portsRoot: string,
  files: readonly PortMasterInstalledFile[],
): Promise<readonly PortMasterInstalledBinary[]> {
  const binaries: PortMasterInstalledBinary[] = []
  for (const file of files) {
    const header = await readFile(join(portsRoot, file.path)).then(bytes =>
      bytes.subarray(0, 64),
    )
    const elf = readElfHeader(header)
    if (elf) binaries.push({ ...file, ...elf })
  }
  return binaries
}

function readElfHeader(
  header: Buffer,
): Omit<PortMasterInstalledBinary, keyof PortMasterInstalledFile> | null {
  if (
    header.length < 20 ||
    header[0] !== 0x7f ||
    header[1] !== 0x45 ||
    header[2] !== 0x4c ||
    header[3] !== 0x46
  ) {
    return null
  }

  const elfClass = header[4] === 1 ? "32" : header[4] === 2 ? "64" : null
  if (!elfClass) return null
  const littleEndian = header[5] === 1
  const machine = littleEndian
    ? header.readUInt16LE(18)
    : header.readUInt16BE(18)
  const arch = archForElf(machine, elfClass)
  return {
    format: "elf",
    elfClass,
    machine: machineName(machine),
    ...(arch ? { arch } : {}),
  }
}

function archForElf(
  machine: number,
  elfClass: "32" | "64",
): PortMasterInstalledBinary["arch"] | undefined {
  if (machine === 183 && elfClass === "64") return "aarch64"
  if (machine === 62 && elfClass === "64") return "x86_64"
  if (machine === 40 && elfClass === "32") return "armhf"
  if (machine === 3 && elfClass === "32") return "x86"
  return undefined
}

function machineName(machine: number): string {
  switch (machine) {
    case 3:
      return "EM_386"
    case 40:
      return "EM_ARM"
    case 62:
      return "EM_X86_64"
    case 183:
      return "EM_AARCH64"
    default:
      return `EM_${machine}`
  }
}

function isLaunchScript(path: string): boolean {
  return basename(path).toLowerCase().endsWith(".sh")
}

function digest(algorithm: "md5" | "sha256", bytes: Buffer): string {
  return createHash(algorithm).update(bytes).digest("hex")
}

function portSlug(id: string): string {
  return id.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
}
