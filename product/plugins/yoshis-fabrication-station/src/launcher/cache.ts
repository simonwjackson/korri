import { createHash } from "node:crypto"
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { YfsLauncherSettings } from "./settings"
import { stableSettingsKey } from "./settings"
import { validateLevelFile, validateYfsWebroot } from "./validate"

const DEFAULT_CACHE_ROOT = `${process.env.XDG_CACHE_HOME ?? "/tmp"}/korri/yfs-launch`

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

async function buildPreparedRoot(
  root: string,
  staging: string,
  webroot: string,
  levelContent: string,
  manifest: PreparedRootManifest,
): Promise<void> {
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  await cp(webroot, staging, { recursive: true })
  await writeFile(join(staging, "level.json"), levelContent)
  await normalizePreparedCopyExportMarker(staging)
  await writeFile(
    join(staging, ".korri-yfs-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  await writeFile(join(staging, ".korri-yfs-ready"), "ready\n")
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
  await mkdir(cacheRoot, { recursive: true })

  const current = await existingManifest(root)
  if (matchesManifest(current, manifest))
    return { root, cacheKey, manifest, rebuilt: false }

  await buildPreparedRoot(root, staging, webroot.root, level.content, manifest)
  const rebuilt = await existingManifest(root)
  if (!matchesManifest(rebuilt, manifest))
    throw new Error(`YFS prepared root rebuild failed for ${cacheKey}`)
  return { root, cacheKey, manifest, rebuilt: true }
}
