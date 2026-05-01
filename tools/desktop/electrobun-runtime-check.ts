import { existsSync } from "node:fs"
import { join } from "node:path"
import { logger } from "@shared/logger"
import { patchFile, type PatchResult } from "./electrobun-patcher"

export interface ElectrobunProbeResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface ElectrobunRuntimeInput {
  platform: NodeJS.Platform
  packageJsonExists: boolean
  cliShimExists: boolean
  probe?: ElectrobunProbeResult
  cliPatchAttempt?: PatchResult
  reprobe?: ElectrobunProbeResult
}

export interface ElectrobunRuntimeReport {
  ok: boolean
  status: "ready" | "failed"
  messages: string[]
  recommendations: string[]
}

const nixDynamicLinkerFailurePatterns = [
  "Could not start dynamically linked executable",
  "NixOS cannot run dynamically linked executables",
  "stub-ld",
]

export function hasNixDynamicLinkerFailure(output: string): boolean {
  return nixDynamicLinkerFailurePatterns.some(pattern =>
    output.includes(pattern),
  )
}

function probeOutput(probe: ElectrobunProbeResult): string {
  return `${probe.stdout}\n${probe.stderr}`
}

function failedProbeReport(probe: ElectrobunProbeResult): ElectrobunRuntimeReport {
  const output = probeOutput(probe)
  const messages: string[] = []
  const recommendations: string[] = []

  if (hasNixDynamicLinkerFailure(output)) {
    messages.push(
      "Electrobun's Linux binary failed under the NixOS dynamic linker stub.",
    )
    recommendations.push(
      "Run inside nix develop so the desktop runtime check can patch Electrobun's Linux binary, enable nix-ld for local development, or add a wrapper/patchelf/Nix derivation before treating desktop packaging as supported on NixOS.",
    )
  } else {
    messages.push(
      `Electrobun native binary probe failed with exit code ${probe.exitCode}.`,
    )
    if (output.trim().length > 0) {
      messages.push(output.trim())
    }
    recommendations.push(
      "Inspect the probe output and verify GTK/WebKitGTK/AppIndicator runtime libraries are available in the dev shell.",
    )
  }

  return { ok: false, status: "failed", messages, recommendations }
}

export function classifyElectrobunRuntime(
  input: ElectrobunRuntimeInput,
): ElectrobunRuntimeReport {
  const messages: string[] = []
  const recommendations: string[] = []

  if (!input.packageJsonExists) {
    messages.push(
      "electrobun is not installed; run the dependency install before desktop checks.",
    )
    recommendations.push(
      "Run `bun install`, then retry the desktop runtime check.",
    )
  }

  if (!input.cliShimExists) {
    messages.push("electrobun CLI shim is missing from node_modules.")
    recommendations.push(
      "Reinstall dependencies so the electrobun binary is linked.",
    )
  }

  if (messages.length > 0) {
    return { ok: false, status: "failed", messages, recommendations }
  }

  if (input.platform !== "linux") {
    messages.push("Non-Linux host detected; NixOS probe skipped.")
    return { ok: true, status: "ready", messages, recommendations }
  }

  if (!input.probe) {
    messages.push("Linux host detected; no native Electrobun probe was run.")
    recommendations.push(
      "Run the desktop runtime check recipe to verify native Electrobun binaries before packaging.",
    )
    return { ok: false, status: "failed", messages, recommendations }
  }

  if (input.probe.exitCode === 0) {
    messages.push("Electrobun native binary probe succeeded.")
    return { ok: true, status: "ready", messages, recommendations }
  }

  const firstProbeOutput = probeOutput(input.probe)
  if (!hasNixDynamicLinkerFailure(firstProbeOutput)) {
    return failedProbeReport(input.probe)
  }

  if (!input.cliPatchAttempt) {
    return failedProbeReport(input.probe)
  }

  messages.push(...input.cliPatchAttempt.messages)
  recommendations.push(...input.cliPatchAttempt.recommendations)

  if (!input.cliPatchAttempt.ok) {
    messages.push(
      "Electrobun auto-patch failed after the NixOS dynamic linker probe failure.",
    )
    recommendations.push(
      "Enable nix-ld for local development if in-flake patching is not available on this machine.",
    )
    return { ok: false, status: "failed", messages, recommendations }
  }

  if (!input.reprobe) {
    messages.push("Electrobun was patched, but no native re-probe was run.")
    recommendations.push(
      "Run the desktop runtime check recipe again to verify the patched binary.",
    )
    return { ok: false, status: "failed", messages, recommendations }
  }

  if (input.reprobe.exitCode === 0) {
    messages.push("Electrobun native binary probe succeeded after auto-patch.")
    return { ok: true, status: "ready", messages, recommendations }
  }

  const reprobeReport = failedProbeReport(input.reprobe)
  return {
    ok: false,
    status: "failed",
    messages: [...messages, ...reprobeReport.messages],
    recommendations: [...recommendations, ...reprobeReport.recommendations],
  }
}

function runNativeProbe(): ElectrobunProbeResult {
  const result = Bun.spawnSync(["bun", "x", "electrobun", "--help"], {
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

export function runElectrobunRuntimeCheck(): ElectrobunRuntimeReport {
  const packageJsonExists = existsSync(
    join(process.cwd(), "node_modules/electrobun/package.json"),
  )
  const cliShimExists = existsSync(
    join(process.cwd(), "node_modules/.bin/electrobun"),
  )

  const shouldProbe = process.platform === "linux" && packageJsonExists
  const firstProbe = shouldProbe ? runNativeProbe() : undefined
  let cliPatchAttempt: PatchResult | undefined
  let reprobe: ElectrobunProbeResult | undefined

  if (
    shouldProbe &&
    firstProbe &&
    firstProbe.exitCode !== 0 &&
    hasNixDynamicLinkerFailure(probeOutput(firstProbe))
  ) {
    cliPatchAttempt = patchFile(
      join(process.cwd(), "node_modules/electrobun/bin/electrobun"),
    )
    if (cliPatchAttempt.ok) {
      reprobe = runNativeProbe()
    }
  }

  return classifyElectrobunRuntime({
    platform: process.platform,
    packageJsonExists,
    cliShimExists,
    probe: firstProbe,
    cliPatchAttempt,
    reprobe,
  })
}

if (import.meta.main) {
  const report = runElectrobunRuntimeCheck()
  const log = report.ok ? logger.info.bind(logger) : logger.error.bind(logger)

  log(
    {
      status: report.status,
      messages: report.messages,
      recommendations: report.recommendations,
    },
    "Electrobun desktop runtime check completed",
  )

  for (const message of report.messages) {
    process.stderr.write(`${message}\n`)
  }
  for (const recommendation of report.recommendations) {
    process.stderr.write(`Recommendation: ${recommendation}\n`)
  }

  process.exit(report.ok ? 0 : 1)
}
