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
import type { PortMasterCompatibilityProfile } from "./compatibility"

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

export interface PortMasterFexWrapperOptions {
  readonly arch: Extract<PortMasterBinaryArch, "x86" | "x86_64">
  readonly fexPath: string
  readonly rootfs: string
  readonly setupEnvPath?: string
  readonly appId?: string
  readonly runDir?: string
  readonly env?: Readonly<Record<string, string>>
}

export interface PortMasterFexWrapperRecord {
  readonly path: string
  readonly arch: Extract<PortMasterBinaryArch, "x86" | "x86_64">
  readonly originalPath: string
  readonly fexPath: string
  readonly rootfs: string
  readonly setupEnvPath?: string
  readonly appId?: string
  readonly runDir?: string
  readonly env: Readonly<Record<string, string>>
}

export interface PortMasterArmhfQemuWrapperOptions {
  readonly qemuArmPath: string
  readonly rootfs: string
  readonly libraryPaths?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

export interface PortMasterArmhfQemuWrapperRecord {
  readonly path: string
  readonly arch: "armhf"
  readonly originalPath: string
  readonly qemuArmPath: string
  readonly rootfs: string
  readonly libraryPaths: readonly string[]
  readonly env: Readonly<Record<string, string>>
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
  readonly fexWrapper?: PortMasterFexWrapperOptions
  readonly armhfQemuWrapper?: PortMasterArmhfQemuWrapperOptions
  readonly compatibility?: PortMasterCompatibilityProfile
  readonly installedAt?: string
}

export interface PortMasterRuntimeDetection {
  readonly kind: "retroarch-libretro"
  readonly launchScriptPaths: readonly string[]
  readonly corePaths: readonly string[]
  readonly evidence: readonly string[]
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
  readonly compatibility?: PortMasterCompatibilityProfile
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
    readonly fexWrappers: readonly PortMasterFexWrapperRecord[]
    readonly armhfQemuWrappers: readonly PortMasterArmhfQemuWrapperRecord[]
    readonly runtimeDetections: readonly PortMasterRuntimeDetection[]
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

  const fexWrappers = await installFexWrappers({
    portsRoot,
    binaries,
    options: input.fexWrapper,
  })
  const armhfQemuWrappers = await installArmhfQemuWrappers({
    portsRoot,
    binaries,
    options: input.armhfQemuWrapper,
  })
  if (fexWrappers.length > 0 || armhfQemuWrappers.length > 0) {
    files = await inspectInstalledFiles(portsRoot, extracted)
  }
  const runtimeDetections = await detectRuntimeCompatibility({
    portsRoot,
    files,
    launchScripts,
  })

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
    ...(input.compatibility ? { compatibility: input.compatibility } : {}),
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
      fexWrappers,
      armhfQemuWrappers,
      runtimeDetections,
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

async function installFexWrappers(input: {
  readonly portsRoot: string
  readonly binaries: readonly PortMasterInstalledBinary[]
  readonly options?: PortMasterFexWrapperOptions
}): Promise<readonly PortMasterFexWrapperRecord[]> {
  if (!input.options) return []
  const wrappers: PortMasterFexWrapperRecord[] = []

  for (const binary of input.binaries) {
    if (binary.arch !== input.options.arch) continue
    if (!isExecutablePayload(binary.path)) continue

    const originalPath = join(
      dirname(binary.path),
      ".korri-fex",
      basename(binary.path),
    )
    const target = join(input.portsRoot, binary.path)
    const originalTarget = join(input.portsRoot, originalPath)
    await mkdir(dirname(originalTarget), { recursive: true })
    await rm(originalTarget, { force: true })
    await rename(target, originalTarget)
    await chmod(originalTarget, 0o755).catch(() => undefined)
    await writeFile(
      target,
      fexWrapperText({
        ...input.options,
        originalTarget,
        path: binary.path,
      }),
    )
    await chmod(target, 0o755)
    wrappers.push({
      path: binary.path,
      arch: input.options.arch,
      originalPath,
      fexPath: input.options.fexPath,
      rootfs: input.options.rootfs,
      ...(input.options.setupEnvPath
        ? { setupEnvPath: input.options.setupEnvPath }
        : {}),
      ...(input.options.appId ? { appId: input.options.appId } : {}),
      ...(input.options.runDir ? { runDir: input.options.runDir } : {}),
      env: input.options.env ?? {},
    })
  }

  return wrappers
}

async function installArmhfQemuWrappers(input: {
  readonly portsRoot: string
  readonly binaries: readonly PortMasterInstalledBinary[]
  readonly options?: PortMasterArmhfQemuWrapperOptions
}): Promise<readonly PortMasterArmhfQemuWrapperRecord[]> {
  if (!input.options) return []
  const wrappers: PortMasterArmhfQemuWrapperRecord[] = []

  for (const binary of input.binaries) {
    if (binary.arch !== "armhf") continue
    if (!isExecutablePayload(binary.path)) continue

    const originalPath = join(
      dirname(binary.path),
      ".korri-qemu-arm",
      basename(binary.path),
    )
    const target = join(input.portsRoot, binary.path)
    const originalTarget = join(input.portsRoot, originalPath)
    await mkdir(dirname(originalTarget), { recursive: true })
    await rm(originalTarget, { force: true })
    await rename(target, originalTarget)
    await chmod(originalTarget, 0o755).catch(() => undefined)
    await writeFile(
      target,
      armhfQemuWrapperText({
        ...input.options,
        originalTarget,
      }),
    )
    await chmod(target, 0o755)
    wrappers.push({
      path: binary.path,
      arch: "armhf",
      originalPath,
      qemuArmPath: input.options.qemuArmPath,
      rootfs: input.options.rootfs,
      libraryPaths: input.options.libraryPaths ?? [],
      env: input.options.env ?? {},
    })
  }

  return wrappers
}

async function detectRuntimeCompatibility(input: {
  readonly portsRoot: string
  readonly files: readonly PortMasterInstalledFile[]
  readonly launchScripts: readonly PortMasterInstalledFile[]
}): Promise<readonly PortMasterRuntimeDetection[]> {
  const corePaths = input.files
    .map(file => file.path)
    .filter(path => /(^|\/)[^/]+_libretro\.so(?:\.|$)/i.test(path))
    .sort((left, right) => left.localeCompare(right))
  const launchScriptPaths: string[] = []
  const evidence = new Set<string>()

  for (const script of input.launchScripts) {
    const text = await readFile(join(input.portsRoot, script.path), "utf8")
      .then(value => value.toLowerCase())
      .catch(() => "")
    if (!text) continue
    const callsRetroarch = /(^|[^a-z0-9_-])retroarch([^a-z0-9_-]|$)/i.test(text)
    const passesCore = /(^|\s)-l(\s|=)/i.test(text)
    if (callsRetroarch || passesCore) {
      launchScriptPaths.push(script.path)
      if (callsRetroarch) evidence.add(`script:${script.path}:retroarch`)
      if (passesCore) evidence.add(`script:${script.path}:-L`)
    }
  }

  for (const path of corePaths) {
    evidence.add(`file:${path}:libretro-core`)
  }

  if (corePaths.length === 0 && launchScriptPaths.length === 0) return []
  return [
    {
      kind: "retroarch-libretro",
      launchScriptPaths: launchScriptPaths.sort((left, right) =>
        left.localeCompare(right),
      ),
      corePaths,
      evidence: [...evidence].sort((left, right) => left.localeCompare(right)),
    },
  ]
}

function isExecutablePayload(path: string): boolean {
  const name = basename(path).toLowerCase()
  if (path.includes("/libs.")) return false
  if (name.startsWith("lib")) return false
  if (name.includes(".so")) return false
  return true
}

function fexWrapperText(
  input: PortMasterFexWrapperOptions & {
    readonly originalTarget: string
    readonly path: string
  },
): string {
  const envDefaults = Object.entries(input.env ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const appId = input.appId ?? portSlug(input.path)
  const runDir = input.runDir ?? `${dirname(input.originalTarget)}/runtime`
  const setupEnv = input.setupEnvPath
    ? `if [ -f ${shellQuote(input.setupEnvPath)} ]; then\n  . ${shellQuote(input.setupEnvPath)}\nfi\n`
    : ""
  const envLines = envDefaults
    .map(
      ([key, value]) =>
        `export ${key}="\${${key}:-${shellParameterDefault(value)}}"`,
    )
    .join("\n")
  return `#!/usr/bin/env bash\nset -e\nexport FEX_ROOTFS="\${FEX_ROOTFS:-${shellParameterDefault(input.rootfs)}}"\nexport KORRI_FEX_RUNTIME_APP_ID="\${KORRI_FEX_RUNTIME_APP_ID:-${shellParameterDefault(appId)}}"\nexport KORRI_FEX_RUNTIME_RUN_DIR="\${KORRI_FEX_RUNTIME_RUN_DIR:-${shellParameterDefault(runDir)}}"\n${setupEnv}${envLines ? `${envLines}\n` : ""}exec ${shellQuote(input.fexPath)} ${shellQuote(input.originalTarget)} "$@"\n`
}

function armhfQemuWrapperText(
  input: PortMasterArmhfQemuWrapperOptions & {
    readonly originalTarget: string
  },
): string {
  const envDefaults = Object.entries(input.env ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const envLines = envDefaults
    .map(
      ([key, value]) =>
        `export ${key}="\${${key}:-${shellParameterDefault(value)}}"`,
    )
    .join("\n")
  const extraLibraryPath = (input.libraryPaths ?? []).join(":")
  const libraryPathLine = extraLibraryPath
    ? `export KORRI_PORTMASTER_ARMHF_LIBRARY_PATH="\${KORRI_PORTMASTER_ARMHF_LIBRARY_PATH:-${shellParameterDefault(extraLibraryPath)}}"\nexport LD_LIBRARY_PATH="\${LD_LIBRARY_PATH:+$LD_LIBRARY_PATH:}$KORRI_PORTMASTER_ARMHF_LIBRARY_PATH"\n`
    : ""
  return `#!/usr/bin/env bash\nset -e\nexport KORRI_PORTMASTER_ARMHF_ROOTFS="\${KORRI_PORTMASTER_ARMHF_ROOTFS:-${shellParameterDefault(input.rootfs)}}"\n${envLines ? `${envLines}\n` : ""}${libraryPathLine}exec ${shellQuote(input.qemuArmPath)} -L "$KORRI_PORTMASTER_ARMHF_ROOTFS" ${shellQuote(input.originalTarget)} "$@"\n`
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function shellParameterDefault(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
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
