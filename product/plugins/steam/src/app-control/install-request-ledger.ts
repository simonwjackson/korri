import { randomUUID } from "node:crypto"
import type { PluginInstallState } from "@platform/library/install-state"

export interface SteamInstallRequestEntry {
  readonly requestId: string
  readonly appId: string
  readonly mode: "install" | "update"
  readonly requestedAt: string
  readonly state: PluginInstallState
  readonly error?: string
}

const inMemoryLedger = new Map<string, SteamInstallRequestEntry>()

export function findActiveSteamInstallRequest(input: {
  readonly appId: string
  readonly mode?: "install" | "update"
}): SteamInstallRequestEntry | undefined {
  const entry = inMemoryLedger.get(`${input.mode ?? "install"}:${input.appId}`)
  if (!entry) return undefined
  return Date.now() - Date.parse(entry.requestedAt) < 10 * 60 * 1000
    ? entry
    : undefined
}

export function upsertSteamInstallRequest(input: {
  readonly appId: string
  readonly mode?: "install" | "update"
  readonly state?: SteamInstallRequestEntry["state"]
  readonly now?: Date
}): SteamInstallRequestEntry {
  const mode = input.mode ?? "install"
  const key = `${mode}:${input.appId}`
  const existing = inMemoryLedger.get(key)
  if (
    existing &&
    Date.now() - Date.parse(existing.requestedAt) < 10 * 60 * 1000
  ) {
    return existing
  }
  const entry: SteamInstallRequestEntry = {
    requestId: randomUUID(),
    appId: input.appId,
    mode,
    requestedAt: (input.now ?? new Date()).toISOString(),
    state: input.state ?? "requested",
  }
  inMemoryLedger.set(key, entry)
  return entry
}

export function findSteamInstallRequestById(
  requestId: string,
): SteamInstallRequestEntry | undefined {
  const entry = [...inMemoryLedger.values()].find(
    candidate => candidate.requestId === requestId,
  )
  if (!entry) return undefined
  return Date.now() - Date.parse(entry.requestedAt) < 10 * 60 * 1000
    ? entry
    : undefined
}

export function resetSteamInstallRequestLedgerForTests(): void {
  inMemoryLedger.clear()
}
