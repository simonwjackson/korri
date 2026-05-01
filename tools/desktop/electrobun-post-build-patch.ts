import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { logger } from "@shared/logger"
import { buildArtifactPaths } from "../artifacts/paths"
import {
  applyPatchPlan,
  hashBuffer,
  isElfBuffer,
  planPatch,
  type PatchDeps,
  type PatchMarker,
} from "./electrobun-patcher"

interface ManifestEntry extends PatchMarker {}

interface PatchManifest {
  files: Record<string, ManifestEntry>
}

export interface PostBuildPatchOptions {
  buildRoot?: string
  interpreter?: string
  libraryPath?: string
}

export interface PostBuildPatchedFile {
  path: string
  status: "applied" | "skipped" | "failed"
  message: string
}

export interface PostBuildPatchReport {
  ok: boolean
  messages: string[]
  files: PostBuildPatchedFile[]
}

const manifestFileName = ".patched-manifest.json"

function normalizeRelativePath(buildRoot: string, filePath: string): string {
  return relative(buildRoot, filePath).split(sep).join("/")
}

function readManifest(manifestPath: string): PatchManifest {
  if (!existsSync(manifestPath)) {
    return { files: {} }
  }

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<PatchManifest>
    if (parsed.files && typeof parsed.files === "object") {
      return { files: parsed.files as Record<string, ManifestEntry> }
    }
  } catch {
    return { files: {} }
  }

  return { files: {} }
}

function writeManifest(manifestPath: string, manifest: PatchManifest) {
  const tempPath = `${manifestPath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(tempPath, manifestPath)
}

function findFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...findFiles(entryPath))
    } else if (entry.isFile() && entry.name !== manifestFileName && !entry.name.endsWith(".patched")) {
      files.push(entryPath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

export function runPostBuildPatch(
  options: PostBuildPatchOptions = {},
  deps: PatchDeps = {},
): PostBuildPatchReport {
  const buildRoot = options.buildRoot ?? buildArtifactPaths.electrobun
  const interpreter = options.interpreter ?? process.env.KORRI_NIX_LD_INTERPRETER
  const libraryPath = options.libraryPath ?? process.env.KORRI_NIX_LD_LIBRARY_PATH
  const messages: string[] = []
  const files: PostBuildPatchedFile[] = []

  if (!existsSync(buildRoot)) {
    return { ok: true, messages: ["nothing to patch"], files }
  }

  const manifestPath = join(buildRoot, manifestFileName)
  const manifest = readManifest(manifestPath)
  let manifestChanged = false

  for (const filePath of findFiles(buildRoot)) {
    const buffer = readFileSync(filePath)
    if (!isElfBuffer(buffer)) {
      continue
    }

    const relativePath = normalizeRelativePath(buildRoot, filePath)
    const fileSha = hashBuffer(buffer)
    const manifestEntry = manifest.files[relativePath]
    if (manifestEntry?.sha === fileSha) {
      files.push({ path: filePath, status: "skipped", message: "already patched" })
      continue
    }

    const patchPlan = planPatch({
      filePath,
      fileExists: true,
      isElf: true,
      fileSha,
      marker: manifestEntry,
      interpreter,
      libraryPath,
    })
    const result = applyPatchPlan(patchPlan, deps)

    if (result.ok) {
      if (result.status === "applied") {
        const patchedSha = hashBuffer(readFileSync(filePath))
        manifest.files[relativePath] = {
          sha: patchedSha,
          patchedAt: new Date().toISOString(),
          interpreter: interpreter ?? "",
          rpath: libraryPath ?? "",
        }
        manifestChanged = true
      }
      files.push({
        path: filePath,
        status: result.status === "applied" ? "applied" : "skipped",
        message: result.messages.at(-1) ?? result.status,
      })
    } else {
      files.push({
        path: filePath,
        status: "failed",
        message: result.messages.join("\n"),
      })
    }
  }

  if (manifestChanged || files.some(file => file.status === "failed")) {
    writeManifest(manifestPath, manifest)
  }

  const ok = files.every(file => file.status !== "failed")
  if (files.length === 0) {
    messages.push("nothing to patch")
  } else {
    messages.push(
      `${files.filter(file => file.status === "applied").length} Electrobun build artifact(s) patched.`,
    )
  }

  return { ok, messages, files }
}

if (import.meta.main) {
  const report = runPostBuildPatch()
  const log = report.ok ? logger.info.bind(logger) : logger.error.bind(logger)

  log({ report }, "Electrobun post-build patch completed")
  for (const message of report.messages) {
    process.stderr.write(`${message}\n`)
  }
  for (const file of report.files) {
    process.stderr.write(`${file.status.toUpperCase()} ${file.path}: ${file.message}\n`)
  }

  process.exit(report.ok ? 0 : 1)
}
