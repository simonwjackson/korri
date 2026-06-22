import { createHash } from "node:crypto"
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import {
  resolveYfsViewport,
  stableSettingsKey,
  type YfsLauncherSettings,
} from "./settings-runtime"
import { validateLevelFile, validateYfsWebroot } from "./validate"

const DEFAULT_CACHE_ROOT = `${process.env.XDG_CACHE_HOME ?? `${process.env.HOME ?? "/tmp"}/.cache`}/korri/yfs-launch`

export interface PrepareYfsLaunchRootInput {
  readonly webroot: string
  readonly levelFile: string
  readonly settings: YfsLauncherSettings
  readonly cacheRoot?: string
  readonly launcherVersion?: string
}

export interface PreparedYfsLaunchRoot {
  readonly root: string
  readonly cacheKey: string
  readonly manifest: PreparedRootManifest
  readonly rebuilt: boolean
}

interface PreparedRootManifest {
  readonly cacheKey: string
  readonly launcherVersion: string
  readonly webrootIdentity: string
  readonly levelDigest: string
  readonly settingsKey: string
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

async function existingManifest(
  path: string,
): Promise<PreparedRootManifest | null> {
  try {
    const manifest = JSON.parse(
      await readFile(join(path, ".korri-yfs-manifest.json"), "utf8"),
    ) as PreparedRootManifest
    await readFile(join(path, ".korri-yfs-ready"), "utf8")
    return manifest
  } catch {
    return null
  }
}

function matchesManifest(
  manifest: PreparedRootManifest | null,
  expected: PreparedRootManifest,
): boolean {
  return Boolean(
    manifest &&
      manifest.cacheKey === expected.cacheKey &&
      manifest.launcherVersion === expected.launcherVersion &&
      manifest.webrootIdentity === expected.webrootIdentity &&
      manifest.levelDigest === expected.levelDigest &&
      manifest.settingsKey === expected.settingsKey,
  )
}

async function patchPreparedCopyViewport(
  root: string,
  settings: YfsLauncherSettings,
): Promise<void> {
  const viewport = resolveYfsViewport(settings)
  const path = join(root, "data.json")
  let data: unknown
  try {
    data = JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    throw new Error(
      `YFS data.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as { project?: unknown }).project)
  )
    throw new Error("YFS data.json is missing project array")
  const project = (data as { project: unknown[] }).project
  if (project.length <= 12)
    throw new Error("YFS data.json project array is missing viewport fields")
  if (
    typeof project[10] !== "number" ||
    typeof project[11] !== "number" ||
    typeof project[12] !== "number"
  )
    throw new Error("YFS data.json viewport fields must be numeric")
  if (project[10] !== 832 || project[11] !== 448 || project[12] !== 4)
    throw new Error(
      `unsupported YFS data.json viewport shape: ${project[10]}x${project[11]} mode ${project[12]}`,
    )

  // Viewport is boot-time Construct project metadata, so it is patched only in
  // the prepared copy. Runtime camera zoom remains in direct-launch.js via
  // ILayout.scale so generated Construct code does not grow new patch points.
  project[10] = viewport.width
  project[11] = viewport.height
  project[12] = 4
  await writeFile(path, `${JSON.stringify(data)}\n`, { mode: 0o600 })
}

async function normalizePreparedCopyExportMarker(root: string): Promise<void> {
  const mainPath = join(root, "scripts/main.js")
  const source = await readFile(mainPath, "utf8")
  if (source.includes('exportType:"html5"')) return
  if (source.includes('exportType:"windows-webview2"')) {
    await writeFile(
      mainPath,
      source.replaceAll('exportType:"windows-webview2"', 'exportType:"html5"'),
    )
    return
  }
  const match = source.match(/exportType:\s*"([^"]+)"/)
  throw new Error(
    `unsupported YFS export marker in prepared copy${match ? `: ${match[1]}` : ""}`,
  )
}

async function makeTreePrivateWritable(root: string): Promise<void> {
  await chmod(root, 0o700)
  const children = await readdir(root, { withFileTypes: true })
  for (const child of children) {
    const path = join(root, child.name)
    if (child.isDirectory()) await makeTreePrivateWritable(path)
    else if (child.isFile()) await chmod(path, 0o600)
  }
}

async function buildPreparedRoot(
  root: string,
  staging: string,
  webroot: string,
  levelContent: string,
  settings: YfsLauncherSettings,
  manifest: PreparedRootManifest,
): Promise<void> {
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true, mode: 0o700 })
  await cp(webroot, staging, { recursive: true })
  await makeTreePrivateWritable(staging)
  await writeFile(join(staging, "level.json"), levelContent, { mode: 0o600 })
  await normalizePreparedCopyExportMarker(staging)
  await patchPreparedCopyViewport(staging, settings)
  await writeFile(
    join(staging, ".korri-yfs-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  )
  await writeFile(join(staging, ".korri-yfs-ready"), "ready\n", {
    mode: 0o600,
  })
  await rm(root, { recursive: true, force: true })
  await rename(staging, root)
}

export async function prepareYfsLaunchRoot(
  input: PrepareYfsLaunchRootInput,
): Promise<PreparedYfsLaunchRoot> {
  const webroot = await validateYfsWebroot(input.webroot)
  const level = await validateLevelFile(input.levelFile)
  const launcherVersion = input.launcherVersion ?? "dev"
  const settingsKey = stableSettingsKey(input.settings)
  const cacheKey = sha256(
    JSON.stringify({
      launcherVersion,
      webrootIdentity: webroot.identity,
      levelDigest: level.digest,
      settingsKey,
    }),
  )
  const manifest: PreparedRootManifest = {
    cacheKey,
    launcherVersion,
    webrootIdentity: webroot.identity,
    levelDigest: level.digest,
    settingsKey,
  }
  const cacheRoot = input.cacheRoot ?? DEFAULT_CACHE_ROOT
  const root = join(cacheRoot, cacheKey)
  const staging = join(cacheRoot, `.staging-${cacheKey}-${process.pid}`)
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 })
  await chmod(cacheRoot, 0o700)

  const current = await existingManifest(root)
  if (matchesManifest(current, manifest))
    return { root, cacheKey, manifest, rebuilt: false }

  await buildPreparedRoot(
    root,
    staging,
    webroot.root,
    level.content,
    input.settings,
    manifest,
  )
  const rebuilt = await existingManifest(root)
  if (!matchesManifest(rebuilt, manifest))
    throw new Error(`YFS prepared root rebuild failed for ${cacheKey}`)
  return { root, cacheKey, manifest, rebuilt: true }
}
