import { readFileSync } from "node:fs"
import { logger } from "@shared/logger"

export type OdinDesktopPreflightStatus = "ready" | "warning" | "blocked"
export type OdinDesktopAppOrigin = "nix" | "non-nix" | "missing"

export interface OdinDesktopPreflightFacts {
  sshReachable: boolean
  architecture: string | null
  projectExists: boolean
  envExists: boolean
  bunExists: boolean
  nixStoreExists: boolean
  nixStoreMounted: boolean
  nixCommandExists: boolean
  nixProfileExists: boolean
  portableNixExists: boolean
  korriDesktopAppPath: string | null
  korriDesktopAppOrigin: OdinDesktopAppOrigin
  appStateRootWritable: boolean
  swayActive: boolean
  esswayActive: boolean
  emulationStationRunning: boolean
  storageAvailableKb: number | null
}

export interface OdinDesktopPreflightReport {
  ok: boolean
  status: OdinDesktopPreflightStatus
  messages: string[]
  recommendations: string[]
}

const minimumStorageKb = 500_000
const recommendedStorageKb = 1_000_000

function parseBoolean(value: string | undefined): boolean {
  return value === "yes" || value === "true" || value === "1"
}

function parseNullableString(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed !== "unknown" ? trimmed : null
}

function parseNullableNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseAppOrigin(value: string | undefined): OdinDesktopAppOrigin {
  if (value === "nix" || value === "non-nix") return value
  return "missing"
}

export function parseOdinDesktopPreflightFacts(
  input: string,
): OdinDesktopPreflightFacts {
  const fields = new Map<string, string>()

  for (const line of input.split(/\r?\n/)) {
    const separator = line.indexOf("=")
    if (separator <= 0) {
      continue
    }

    fields.set(line.slice(0, separator), line.slice(separator + 1))
  }

  return {
    sshReachable: parseBoolean(fields.get("ssh_reachable")),
    architecture: parseNullableString(fields.get("architecture")),
    projectExists: parseBoolean(fields.get("project_exists")),
    envExists: parseBoolean(fields.get("env_exists")),
    bunExists: parseBoolean(fields.get("bun_exists")),
    nixStoreExists: parseBoolean(fields.get("nix_store_exists")),
    nixStoreMounted: parseBoolean(fields.get("nix_store_mounted")),
    nixCommandExists: parseBoolean(fields.get("nix_command_exists")),
    nixProfileExists: parseBoolean(fields.get("nix_profile_exists")),
    portableNixExists: parseBoolean(fields.get("portable_nix_exists")),
    korriDesktopAppPath: parseNullableString(
      fields.get("korri_desktop_app_path"),
    ),
    korriDesktopAppOrigin: parseAppOrigin(
      fields.get("korri_desktop_app_origin"),
    ),
    appStateRootWritable: parseBoolean(fields.get("app_state_root_writable")),
    swayActive: parseBoolean(fields.get("sway_active")),
    esswayActive: parseBoolean(fields.get("essway_active")),
    emulationStationRunning: parseBoolean(
      fields.get("emulationstation_running"),
    ),
    storageAvailableKb: parseNullableNumber(fields.get("storage_available_kb")),
  }
}

export function classifyOdinDesktopPreflight(
  facts: OdinDesktopPreflightFacts,
): OdinDesktopPreflightReport {
  const messages: string[] = []
  const recommendations: string[] = []
  const warnings: string[] = []

  const block = (message: string, recommendation: string) => {
    messages.push(message)
    recommendations.push(recommendation)
  }

  const warn = (message: string, recommendation: string) => {
    warnings.push(message)
    recommendations.push(recommendation)
  }

  if (!facts.sshReachable) {
    block(
      "Odin is not reachable over SSH.",
      "Boot the Odin, confirm Tailscale or LAN connectivity, then retry with ODIN_HOST=root@<host> just odin-desktop-preflight.",
    )
  }

  if (facts.sshReachable && facts.architecture !== "aarch64") {
    block(
      `Odin architecture is ${facts.architecture ?? "unknown"}, expected aarch64.`,
      "Run this only against the AYN Odin ROCKNIX device; the desktop package target is aarch64-linux.",
    )
  }

  if (facts.sshReachable && !facts.projectExists) {
    block(
      "Korri project directory is missing on the Odin.",
      "Run `just install-odin` before attempting the Electrobun desktop launch path.",
    )
  }

  if (facts.sshReachable && !facts.envExists) {
    block(
      "Odin Korri environment file is missing.",
      "Run `just install-odin` while EmulationStation is active so Wayland, DBus, and library roots are harvested into $ODIN_PROJECT/.env.",
    )
  }

  if (facts.sshReachable && !facts.bunExists) {
    block(
      "Bun is missing at /storage/bin/bun on the Odin.",
      "Run `just install-odin` to install the aarch64 Bun runtime used by existing Odin tooling.",
    )
  }

  if (facts.sshReachable && (!facts.nixStoreExists || !facts.nixStoreMounted)) {
    block(
      "Odin does not expose a real mounted /nix store.",
      "Repair ROCKNIX Layer 4+ real /nix support before launching Korri; the Chromium renderer fallback has been removed.",
    )
  }

  if (facts.sshReachable && !facts.nixCommandExists) {
    block(
      "The nix command is not available on the Odin.",
      "Repair ROCKNIX Nix integration before attempting the Layer 8 Electrobun renderer path.",
    )
  }

  if (facts.sshReachable && facts.portableNixExists && !facts.nixStoreMounted) {
    block(
      "Only portable/proot Nix appears to be available on the Odin.",
      "Do not stage Electrobun closures through /storage/.nix-portable; boot a ROCKNIX image with real /nix support.",
    )
  }

  if (facts.sshReachable && !facts.appStateRootWritable) {
    block(
      "Electrobun app state root is not writable under /storage.",
      "Fix /storage permissions or choose a writable KORRI_ELECTROBUN_STATE_ROOT before launching Electrobun.",
    )
  }

  if (facts.sshReachable && facts.korriDesktopAppOrigin === "non-nix") {
    block(
      `Korri Electrobun app resolves outside the Nix store/profile: ${facts.korriDesktopAppPath ?? "unknown"}.`,
      "Install or select a Nix-managed korri-desktop/korri-desktop-odin app before running the Layer 8 renderer smoke.",
    )
  }

  if (facts.sshReachable && !facts.swayActive) {
    block(
      "sway.service is not active on the Odin.",
      "Boot ROCKNIX into its normal frontend session before launching Korri Electrobun; the GUI needs the live Wayland session.",
    )
  }

  if (facts.sshReachable && facts.storageAvailableKb === null) {
    warn(
      "Could not determine free space on /storage.",
      "Check `df -k /storage` manually before installing or launching the Electrobun app.",
    )
  } else if (
    facts.sshReachable &&
    facts.storageAvailableKb !== null &&
    facts.storageAvailableKb < minimumStorageKb
  ) {
    block(
      "Odin /storage has less than 500 MiB free.",
      "Free space under /storage before launching the Electrobun renderer profile.",
    )
  } else if (
    facts.sshReachable &&
    facts.storageAvailableKb !== null &&
    facts.storageAvailableKb < recommendedStorageKb
  ) {
    warn(
      "Odin /storage has less than 1 GiB free; app state and logs may be tight.",
      "Free additional /storage space if Electrobun profile state, logs, or Nix profile activation fails.",
    )
  }

  if (facts.sshReachable && !facts.nixProfileExists) {
    warn(
      "Odin /storage/.nix-profile is missing.",
      "Layer 8 substrate can still be healthy, but install or profile-activate Korri Electrobun before expecting app launch readiness.",
    )
  }

  if (facts.sshReachable && facts.korriDesktopAppOrigin === "missing") {
    warn(
      "Korri Electrobun app is not installed or not on PATH yet.",
      "Install or expose the Nix-managed korri-desktop/korri-desktop-odin app before running the Electrobun renderer smoke.",
    )
  }

  if (facts.sshReachable && !facts.esswayActive) {
    warn(
      "essway.service is not active; EmulationStation may already be stopped.",
      "Launch/stop scripts should still be idempotent, but recovery may require restarting essway.service or rebooting.",
    )
  }

  if (facts.sshReachable && !facts.emulationStationRunning) {
    warn(
      "EmulationStation is not running right now.",
      "If $ODIN_PROJECT/.env is stale, rerun `just install-odin` after EmulationStation starts so the session env is refreshed.",
    )
  }

  if (messages.length > 0) {
    return {
      ok: false,
      status: "blocked",
      messages: [...messages, ...warnings],
      recommendations,
    }
  }

  if (warnings.length > 0) {
    return {
      ok: true,
      status: "warning",
      messages: warnings,
      recommendations,
    }
  }

  return {
    ok: true,
    status: "ready",
    messages: ["Odin Layer 8 Electrobun preflight passed."],
    recommendations,
  }
}

function readStdin(): string {
  return readFileSync(0, "utf8")
}

if (import.meta.main) {
  const facts = parseOdinDesktopPreflightFacts(readStdin())
  const report = classifyOdinDesktopPreflight(facts)
  const log = report.ok ? logger.info.bind(logger) : logger.error.bind(logger)

  log(
    {
      status: report.status,
      messages: report.messages,
      recommendations: report.recommendations,
    },
    "Odin desktop preflight completed",
  )

  for (const message of report.messages) {
    process.stderr.write(`${message}\n`)
  }
  for (const recommendation of report.recommendations) {
    process.stderr.write(`Recommendation: ${recommendation}\n`)
  }

  process.exit(report.ok ? 0 : 1)
}
