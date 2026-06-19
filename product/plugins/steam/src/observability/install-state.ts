import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { PluginInstallState } from "@platform/library/install-state"
import { parseVdf } from "../state-materializer"
import { sanitizeSteamEvidenceExcerpt } from "./evidence-sanitizer"

export interface SteamInstallSnapshot {
  readonly appId: string
  readonly state: PluginInstallState
  readonly bytesDownloaded?: number
  readonly bytesToDownload?: number
  readonly percent?: number
  readonly stateFlags?: number
  readonly buildId?: string
  readonly sizeOnDisk?: number
  readonly lastEvidenceAt?: string
  readonly message: string
  readonly providerEvidence: Readonly<Record<string, unknown>>
  readonly nextActionHint: "wait" | "retry" | "inspect-diagnostics" | "none"
}

export interface CollectSteamInstallSnapshotInput {
  readonly appId: string
  readonly steamHome?: string
  readonly requested?: boolean
  readonly readText?: (path: string) => Promise<string | undefined>
}

export async function collectSteamInstallSnapshot(
  input: CollectSteamInstallSnapshotInput,
): Promise<SteamInstallSnapshot> {
  const steamHome = input.steamHome ?? process.env.KORRI_STEAM_HOME ?? "/var/lib/korri/steam"
  const readText = input.readText ?? readTextOrUndefined
  const manifestPath = join(steamHome, "steamapps", `appmanifest_${input.appId}.acf`)
  const manifest = await readText(manifestPath)
  if (!manifest) {
    return {
      appId: input.appId,
      state: input.requested ? "requested" : "not-installed",
      message: input.requested ? "Install requested; waiting for Steam manifest" : "Steam app is not installed",
      providerEvidence: {},
      nextActionHint: input.requested ? "wait" : "none",
    }
  }
  try {
    const parsed = parseVdf(manifest)
    const appState = recordField(parsed, "AppState") ?? parsed
    const stateFlags = numberField(appState, "StateFlags")
    const bytesDownloaded = numberField(appState, "BytesDownloaded")
    const bytesToDownload = numberField(appState, "BytesToDownload")
    const buildId = stringField(appState, "buildid") ?? stringField(appState, "BuildID")
    const sizeOnDisk = numberField(appState, "SizeOnDisk")
    const percent = percentFrom(bytesDownloaded, bytesToDownload)
    const state = stateFromManifest({ stateFlags, bytesDownloaded, bytesToDownload })
    return {
      appId: input.appId,
      state,
      ...(bytesDownloaded !== undefined ? { bytesDownloaded } : {}),
      ...(bytesToDownload !== undefined ? { bytesToDownload } : {}),
      ...(percent !== undefined ? { percent } : {}),
      ...(stateFlags !== undefined ? { stateFlags } : {}),
      ...(buildId ? { buildId } : {}),
      ...(sizeOnDisk !== undefined ? { sizeOnDisk } : {}),
      lastEvidenceAt: new Date().toISOString(),
      message: messageForState(state),
      providerEvidence: {
        ...(stateFlags !== undefined ? { stateFlags } : {}),
        ...(buildId ? { buildId } : {}),
        ...(sizeOnDisk !== undefined ? { sizeOnDisk } : {}),
      },
      nextActionHint: state === "installed" ? "none" : state === "failed" ? "retry" : "wait",
    }
  } catch (error) {
    return {
      appId: input.appId,
      state: "unknown",
      message: sanitizeSteamEvidenceExcerpt(error, { maxLength: 160 }),
      providerEvidence: {},
      nextActionHint: "inspect-diagnostics",
    }
  }
}

function stateFromManifest(input: {
  readonly stateFlags?: number
  readonly bytesDownloaded?: number
  readonly bytesToDownload?: number
}): PluginInstallState {
  if (input.bytesToDownload && input.bytesDownloaded !== undefined && input.bytesDownloaded < input.bytesToDownload) {
    return "downloading"
  }
  if (input.stateFlags === 4) return "installed"
  if (input.stateFlags !== undefined && (input.stateFlags & 1024) !== 0) return "downloading"
  if (input.stateFlags !== undefined && input.stateFlags !== 0) return "installing"
  return "unknown"
}

function percentFrom(done: number | undefined, total: number | undefined): number | undefined {
  if (!total || done === undefined || total <= 0) return undefined
  return Math.max(0, Math.min(100, (done / total) * 100))
}
function messageForState(state: PluginInstallState): string {
  switch (state) {
    case "installed": return "Steam app is installed"
    case "downloading": return "Steam app is downloading"
    case "installing": return "Steam app is installing"
    case "requested": return "Steam app install requested"
    case "not-installed": return "Steam app is not installed"
    case "failed": return "Steam app install failed"
    default: return "Steam app install state is unknown"
  }
}
function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key]
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined
}
function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === "number") return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return undefined
}
async function readTextOrUndefined(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8") } catch { return undefined }
}
