import type { PluginInstallState } from "@platform/library/install-state"

export interface SteamInstallLogSignal {
  readonly appId: string
  readonly state: PluginInstallState
  readonly excerpt: string
}

export function parseSteamInstallLogSignal(line: string): SteamInstallLogSignal | undefined {
  const appId = line.match(/\bAppID\s+([0-9]+)\b/)?.[1] ?? line.match(/\bapp\s+([0-9]+)\b/i)?.[1]
  if (!appId) return undefined
  const lower = line.toLowerCase()
  const state = lower.includes("fail") || lower.includes("error") ? "failed" : lower.includes("download") ? "downloading" : lower.includes("install") ? "installing" : undefined
  return state ? { appId, state, excerpt: line.slice(0, 240) } : undefined
}
