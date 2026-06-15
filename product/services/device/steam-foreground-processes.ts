export interface SteamForegroundProcessInfo {
  readonly pid: number
  readonly uid?: number
  readonly cmdline: readonly string[]
}

export interface SteamForegroundProcessFilter {
  readonly appId?: string
}

export function collectSteamForegroundProcesses(
  processes: readonly SteamForegroundProcessInfo[],
  filter: SteamForegroundProcessFilter = {},
): readonly SteamForegroundProcessInfo[] {
  return processes.filter(process => isSteamForegroundProcess(process, filter))
}

export function isSteamForegroundProcess(
  process: SteamForegroundProcessInfo,
  filter: SteamForegroundProcessFilter = {},
): boolean {
  if (filter.appId && steamAppIdFromProcess(process) !== filter.appId) {
    return false
  }

  const commandLine = commandLineForMatch(process)
  if (/\bSteamLaunch AppId=\d+\b/.test(commandLine)) return true
  if (!commandLine.includes("/var/lib/korri/steam/steamapps/common/")) {
    return false
  }
  return /\.exe(?:\s|$)/i.test(commandLine)
}

export function steamAppIdFromProcess(
  process: SteamForegroundProcessInfo,
): string | undefined {
  const match = commandLineForMatch(process).match(/\bSteamLaunch AppId=(\d+)\b/)
  return match?.[1]
}

export function formatSteamForegroundProcessForLog(
  process: SteamForegroundProcessInfo,
) {
  return {
    pid: process.pid,
    cmdline: process.cmdline.join(" ").slice(0, 500),
  }
}

function commandLineForMatch(process: SteamForegroundProcessInfo): string {
  return process.cmdline.join(" ")
}
