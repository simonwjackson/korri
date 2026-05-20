import { readFile } from "node:fs/promises"
import { korriStatePath } from "@shared/config/xdg-paths"
import { findKorriWindows, type SwayNode } from "./sessiond-sway"

export interface ElectrobunProofStatus {
  readonly url: string
  readonly pid: number
  readonly profile: string
  readonly timestamp?: string
}

export interface ElectrobunProofInput {
  readonly status?: ElectrobunProofStatus
  readonly healthOk: boolean
  readonly webkitProcessAlive: boolean
  readonly korriWindowCount: number
  readonly focusedFullscreenWindow: boolean
  readonly rendererFatalLogLines: readonly string[]
  readonly forbiddenFallbackFlags: readonly string[]
  readonly positiveGpuEvidence: boolean
}

export interface ElectrobunProofReport {
  readonly ok: boolean
  readonly gpuAccepted: boolean
  readonly issues: readonly string[]
  readonly warnings: readonly string[]
}

export function evaluateElectrobunProof(
  input: ElectrobunProofInput,
): ElectrobunProofReport {
  const issues: string[] = []
  const warnings: string[] = []

  if (!input.status) {
    issues.push("Electrobun status file was not written")
  } else {
    if (input.status.profile !== "device") {
      warnings.push(`Electrobun profile is ${input.status.profile}, not device`)
    }
    if (!input.status.url.startsWith("http://127.0.0.1:")) {
      issues.push(`Electrobun status URL is not loopback: ${input.status.url}`)
    }
  }

  if (!input.healthOk) {
    issues.push("Electrobun loopback /api/health did not respond")
  }
  if (!input.webkitProcessAlive) {
    issues.push("WebKit/Electrobun render process was not observed alive")
  }
  if (input.korriWindowCount === 0) {
    issues.push("Sway did not report a Korri Electrobun window")
  }
  if (input.korriWindowCount > 0 && !input.focusedFullscreenWindow) {
    issues.push("Korri Electrobun window is not focused and fullscreen")
  }

  for (const line of input.rendererFatalLogLines) {
    issues.push(`Electrobun renderer fatal log: ${line}`)
  }

  if (input.forbiddenFallbackFlags.length > 0) {
    warnings.push(
      `GPU acceptance blocked by fallback flags: ${input.forbiddenFallbackFlags.join(", ")}`,
    )
  }
  if (!input.positiveGpuEvidence) {
    warnings.push(
      "GPU acceptance needs positive device-screen/log evidence; liveness alone is not enough",
    )
  }

  const ok = issues.length === 0
  const gpuAccepted =
    ok && input.forbiddenFallbackFlags.length === 0 && input.positiveGpuEvidence

  return { ok, gpuAccepted, issues, warnings }
}

async function main() {
  const statusPath =
    process.env.KORRI_DESKTOP_STATUS_FILE ??
    korriStatePath(process.env, "electrobun", "status.json")
  const status = await readStatus(statusPath)
  const healthOk = status ? await probeHealth(status.url) : false
  const tree = await readSwayTreeIfAvailable()
  const windows = tree ? findKorriWindows(tree) : []
  const report = evaluateElectrobunProof({
    status,
    healthOk,
    webkitProcessAlive: await processAlive(),
    korriWindowCount: windows.length,
    focusedFullscreenWindow: windows.some(
      window => window.focused && window.fullscreen,
    ),
    rendererFatalLogLines: await rendererFatalLogLines(
      process.env.KORRI_ELECTROBUN_LOG,
    ),
    forbiddenFallbackFlags: forbiddenFallbackFlags(process.env),
    positiveGpuEvidence: process.env.KORRI_ELECTROBUN_GPU_EVIDENCE === "1",
  })

  for (const issue of report.issues)
    console.error(`[electrobun-smoke] ${issue}`)
  for (const warning of report.warnings)
    console.error(`[electrobun-smoke] ${warning}`)

  if (!report.ok || !report.gpuAccepted) process.exit(1)
  console.log("[electrobun-smoke] ok: Electrobun Layer 8 GPU proof accepted")
}

async function readStatus(
  path: string,
): Promise<ElectrobunProofStatus | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ElectrobunProofStatus
  } catch {
    return undefined
  }
}

async function probeHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/health", baseUrl), {
      signal: AbortSignal.timeout(2_000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function readSwayTreeIfAvailable(): Promise<SwayNode | undefined> {
  const proc = Bun.spawn(["swaymsg", "-t", "get_tree"], {
    stdout: "pipe",
    stderr: "ignore",
  })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) return undefined
  return JSON.parse(stdout) as SwayNode
}

async function processAlive(): Promise<boolean> {
  const proc = Bun.spawn(
    ["pgrep", "-f", "WebKitWebProcess|libNativeWrapper|korri-desktop"],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  )
  return (await proc.exited) === 0
}

async function rendererFatalLogLines(
  path: string | undefined,
): Promise<readonly string[]> {
  if (!path) return []
  try {
    const log = await readFile(path, "utf8")
    return log
      .split("\n")
      .filter(
        line =>
          line.includes("Could not create default EGL display") ||
          line.includes("cannot open display"),
      )
  } catch {
    return []
  }
}

export function forbiddenFallbackFlags(
  env: Record<string, string | undefined>,
): readonly string[] {
  const flags: string[] = []
  if (env.GSK_RENDERER === "cairo") flags.push("GSK_RENDERER=cairo")
  if (env.WEBKIT_DISABLE_COMPOSITING_MODE === "1") {
    flags.push("WEBKIT_DISABLE_COMPOSITING_MODE=1")
  }
  if (env.WEBKIT_DISABLE_DMABUF_RENDERER === "1") {
    flags.push("WEBKIT_DISABLE_DMABUF_RENDERER=1")
  }
  return flags
}

if (import.meta.main) {
  main().catch(error => {
    console.error(
      `[electrobun-smoke] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
