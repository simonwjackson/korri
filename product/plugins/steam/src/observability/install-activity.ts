import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { parseVdf } from "../state-materializer"
import { sanitizeSteamEvidenceExcerpt } from "./evidence-sanitizer"

export interface SteamBusySnapshot {
  readonly state: "idle" | "active" | "unknown"
  readonly busyAppIds: readonly string[]
  readonly evidence: readonly string[]
}

export interface CollectSteamBusySnapshotInput {
  readonly steamHome?: string
  readonly listSteamAppManifestPaths?: () => Promise<readonly string[]>
  readonly readText?: (path: string) => Promise<string | undefined>
}

export async function collectSteamBusySnapshot(
  input: CollectSteamBusySnapshotInput = {},
): Promise<SteamBusySnapshot> {
  const steamHome =
    input.steamHome ?? process.env.KORRI_STEAM_HOME ?? "/var/lib/korri/steam"
  const listManifestPaths =
    input.listSteamAppManifestPaths ??
    (() => listSteamAppManifestPaths(steamHome))
  const readText = input.readText ?? readTextOrUndefined

  let manifestPaths: readonly string[]
  try {
    manifestPaths = await listManifestPaths()
  } catch (error) {
    return {
      state: "unknown",
      busyAppIds: [],
      evidence: [sanitizeSteamEvidenceExcerpt(error, { maxLength: 160 })],
    }
  }

  const busyAppIds: string[] = []
  const evidence: string[] = []
  for (const path of manifestPaths) {
    const appId = appIdFromManifestPath(path)
    if (!appId) continue
    const content = await readText(path)
    if (!content) continue
    try {
      const parsed = parseVdf(content)
      const appState = recordField(parsed, "AppState") ?? parsed
      const stateFlags = numberField(appState, "StateFlags")
      const bytesDownloaded = numberField(appState, "BytesDownloaded")
      const bytesToDownload = numberField(appState, "BytesToDownload")
      if (
        manifestIndicatesBusy({ stateFlags, bytesDownloaded, bytesToDownload })
      ) {
        busyAppIds.push(appId)
        evidence.push(
          `AppID ${appId}: StateFlags=${stateFlags ?? "unknown"}` +
            (bytesDownloaded !== undefined && bytesToDownload !== undefined
              ? ` BytesDownloaded=${bytesDownloaded}/${bytesToDownload}`
              : ""),
        )
      }
    } catch (error) {
      return {
        state: "unknown",
        busyAppIds,
        evidence: [
          ...evidence,
          `AppID ${appId}: ${sanitizeSteamEvidenceExcerpt(error, {
            maxLength: 120,
          })}`,
        ],
      }
    }
  }

  return {
    state: busyAppIds.length > 0 ? "active" : "idle",
    busyAppIds,
    evidence,
  }
}

async function listSteamAppManifestPaths(
  steamHome: string,
): Promise<readonly string[]> {
  const steamapps = join(steamHome, "steamapps")
  const entries = await readdir(steamapps, { withFileTypes: true })
  return entries
    .filter(
      entry => entry.isFile() && /^appmanifest_\d+\.acf$/i.test(entry.name),
    )
    .map(entry => join(steamapps, entry.name))
    .sort()
}

function appIdFromManifestPath(path: string): string | undefined {
  return basename(path).match(/^appmanifest_(\d+)\.acf$/i)?.[1]
}

function manifestIndicatesBusy(input: {
  readonly stateFlags?: number
  readonly bytesDownloaded?: number
  readonly bytesToDownload?: number
}): boolean {
  if (
    input.bytesToDownload !== undefined &&
    input.bytesToDownload > 0 &&
    input.bytesDownloaded !== undefined &&
    input.bytesDownloaded < input.bytesToDownload
  ) {
    return true
  }
  if (input.stateFlags === undefined || input.stateFlags === 0) return false
  if (input.stateFlags === 4) return false
  return true
}

function recordField(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key]
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key]
  if (typeof value === "number") return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return undefined
}

async function readTextOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return undefined
  }
}
