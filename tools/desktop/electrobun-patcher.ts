import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"

export interface PatchMarker {
  sha: string
  patchedAt: string
  interpreter: string
  rpath: string
}

export interface PatchInput {
  filePath: string
  fileExists: boolean
  isElf: boolean
  fileSha?: string
  marker?: PatchMarker | null
  interpreter?: string
  libraryPath?: string
}

export type PatchPlan =
  | {
      status: "patch"
      filePath: string
      reason: string
      interpreter: string
      rpath: string
      args: string[]
      markerPath: string
    }
  | { status: "skip"; filePath: string; reason: string; messages: string[] }
  | {
      status: "error"
      filePath: string
      messages: string[]
      recommendations: string[]
    }

export interface PatchResult {
  ok: boolean
  status: "applied" | "skipped" | "failed"
  filePath: string
  messages: string[]
  recommendations: string[]
}

export interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface PatchDeps {
  spawnSync?: (command: string, args: string[]) => SpawnResult
  now?: () => Date
}

export interface BuildPatchInputOptions {
  interpreter?: string
  libraryPath?: string
  markerPath?: string
}

function defaultSpawnSync(command: string, args: string[]): SpawnResult {
  const result = Bun.spawnSync([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export function hashFile(path: string): string {
  return hashBuffer(readFileSync(path))
}

export function isElfBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  )
}

export function readPatchMarker(markerPath: string): PatchMarker | null {
  if (!existsSync(markerPath)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8")) as Partial<PatchMarker>
    if (
      typeof parsed.sha === "string" &&
      typeof parsed.patchedAt === "string" &&
      typeof parsed.interpreter === "string" &&
      typeof parsed.rpath === "string"
    ) {
      return {
        sha: parsed.sha,
        patchedAt: parsed.patchedAt,
        interpreter: parsed.interpreter,
        rpath: parsed.rpath,
      }
    }
  } catch {
    return null
  }

  return null
}

export function buildPatchInputFromFile(
  filePath: string,
  options: BuildPatchInputOptions = {},
): PatchInput {
  if (!existsSync(filePath)) {
    return {
      filePath,
      fileExists: false,
      isElf: false,
      interpreter: options.interpreter ?? process.env.KORRI_NIX_LD_INTERPRETER,
      libraryPath: options.libraryPath ?? process.env.KORRI_NIX_LD_LIBRARY_PATH,
    }
  }

  const buffer = readFileSync(filePath)
  const markerPath = options.markerPath ?? `${filePath}.patched`

  return {
    filePath,
    fileExists: true,
    isElf: isElfBuffer(buffer),
    fileSha: hashBuffer(buffer),
    marker: readPatchMarker(markerPath),
    interpreter: options.interpreter ?? process.env.KORRI_NIX_LD_INTERPRETER,
    libraryPath: options.libraryPath ?? process.env.KORRI_NIX_LD_LIBRARY_PATH,
  }
}

export function planPatch(input: PatchInput): PatchPlan {
  if (!input.fileExists) {
    return {
      status: "skip",
      filePath: input.filePath,
      reason: "file not found",
      messages: [`${input.filePath} does not exist.`],
    }
  }

  if (!input.isElf) {
    return {
      status: "skip",
      filePath: input.filePath,
      reason: "not an ELF file",
      messages: [`${input.filePath} is not an ELF file.`],
    }
  }

  if (!input.interpreter || !input.libraryPath) {
    return {
      status: "error",
      filePath: input.filePath,
      messages: [
        "Nix dynamic linker patch inputs are missing from the environment.",
      ],
      recommendations: [
        "Run inside nix develop; the dev shell exposes patchelf inputs.",
        "Alternatively enable nix-ld for local development.",
      ],
    }
  }

  if (input.fileSha && input.marker?.sha === input.fileSha) {
    return {
      status: "skip",
      filePath: input.filePath,
      reason: "already patched",
      messages: [`${input.filePath} is already patched.`],
    }
  }

  const reason = input.marker
    ? "binary changed since last patch"
    : "binary has not been patched"
  const markerPath = `${input.filePath}.patched`

  return {
    status: "patch",
    filePath: input.filePath,
    reason,
    interpreter: input.interpreter,
    rpath: input.libraryPath,
    args: [
      "--set-interpreter",
      input.interpreter,
      "--set-rpath",
      input.libraryPath,
      input.filePath,
    ],
    markerPath,
  }
}

export function applyPatchPlan(
  plan: PatchPlan,
  deps: PatchDeps = {},
): PatchResult {
  if (plan.status === "skip") {
    return {
      ok: true,
      status: "skipped",
      filePath: plan.filePath,
      messages: plan.messages,
      recommendations: [],
    }
  }

  if (plan.status === "error") {
    return {
      ok: false,
      status: "failed",
      filePath: plan.filePath,
      messages: plan.messages,
      recommendations: plan.recommendations,
    }
  }

  const spawnSync = deps.spawnSync ?? defaultSpawnSync
  const result = spawnSync("patchelf", plan.args)
  if (result.exitCode !== 0) {
    return {
      ok: false,
      status: "failed",
      filePath: plan.filePath,
      messages: [
        `patchelf failed for ${plan.filePath} with exit code ${result.exitCode}.`,
        result.stderr || result.stdout,
      ].filter(Boolean),
      recommendations: [
        "Inspect the Nix dynamic linker and library path values exposed by the dev shell.",
      ],
    }
  }

  const marker: PatchMarker = {
    sha: hashFile(plan.filePath),
    patchedAt: (deps.now ?? (() => new Date()))().toISOString(),
    interpreter: plan.interpreter,
    rpath: plan.rpath,
  }
  writeFileSync(plan.markerPath, `${JSON.stringify(marker, null, 2)}\n`)

  return {
    ok: true,
    status: "applied",
    filePath: plan.filePath,
    messages: [`Patched ${plan.filePath}.`],
    recommendations: [],
  }
}

export function patchFile(
  filePath: string,
  options: BuildPatchInputOptions = {},
  deps: PatchDeps = {},
): PatchResult {
  return applyPatchPlan(planPatch(buildPatchInputFromFile(filePath, options)), deps)
}
