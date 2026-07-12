#!/usr/bin/env bun

interface RemoteResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface SectionMap {
  readonly [name: string]: readonly string[]
}

const args = new Map<string, string>()
for (let index = 2; index < Bun.argv.length; index += 1) {
  const arg = Bun.argv[index]
  const next = Bun.argv[index + 1]
  if (arg.startsWith("--") && next && !next.startsWith("--")) {
    args.set(arg.slice(2), next)
    index += 1
  }
}

const host = args.get("host") ?? "bandai-guest-ip"
const sshConfig = args.get("ssh-config") ?? "/tmp/bandai-deploy/ssh_config_ip"
const appId = args.get("app-id") ?? "1029210"
const since = args.get("since") ?? "2026-07-06 12:07:30"
const until = args.get("until") ?? "2026-07-06 12:13:30"

async function runRemote(script: string): Promise<RemoteResult> {
  const proc = Bun.spawn(["ssh", "-F", sshConfig, host, "bash", "-s"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  proc.stdin.write(new TextEncoder().encode(script))
  proc.stdin.end()
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

function parseSections(stdout: string): SectionMap {
  const sections: Record<string, string[]> = {}
  let current = "preamble"
  for (const line of stdout.split("\n")) {
    const match = line.match(/^###([A-Z0-9_ -]+)$/)
    if (match) {
      current = match[1].trim()
      sections[current] = []
    } else {
      sections[current] ??= []
      if (line.length > 0) sections[current].push(line)
    }
  }
  return sections
}

function countMatches(lines: readonly string[], pattern: RegExp): number {
  return lines.filter(line => pattern.test(line)).length
}

function steamTimestamp(line: string): string | undefined {
  return line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/)?.[1]
}

function filterSteamWindow(lines: readonly string[]): readonly string[] {
  return lines.filter(line => {
    const timestamp = steamTimestamp(line)
    return timestamp !== undefined && timestamp >= since && timestamp <= until
  })
}

const remoteScript = String.raw`
set -u
app_id='__APP_ID__'
since='__SINCE__'
until='__UNTIL__'
log_dir=/var/lib/korri/steam/logs
manifest=/var/lib/korri/steam/steamapps/appmanifest___APP_ID__.acf

echo '###SERVICE_STATUS'
systemctl show korri-steam-gamescope.service \
  -p ActiveState -p SubState -p Result -p ExecMainStatus -p ExecMainCode -p NRestarts \
  2>/dev/null || true

echo '###SERVICE_JOURNAL'
journalctl -u korri-steam-gamescope.service --since "$since" --until "$until" --no-pager -o short-iso 2>/dev/null \
  | grep -a -E 'Started|Stopped|stopping|Starting|Main process exited|code=|status=|korri-steam-service-run|uimode|refusing|accepted|relaunch|restart|Gamepad|Big Picture|exit' \
  || true

echo '###CONSOLE_RESTART_MARKERS'
if [ -f "$log_dir/console_log.txt" ]; then
  grep -a -E 'Console Log Start|ExecCommandLine|Shutdown|Restart|relaunch|Exit|exiting|CProcessEnvironmentManager|System startup time|steamwebhelper|uimode|Gamepad|Big Picture|Client version' "$log_dir/console_log.txt" \
    | tail -120 \
    || true
fi

echo '###CONTENT_APP_MARKERS'
if [ -f "$log_dir/content_log.txt" ]; then
  grep -a -E "AppID __APP_ID__|Client version|Loaded Steam library folders|Loaded [0-9]+ apps from install folder|state changed|update canceled|update started|scheduler finished|Fully Installed" "$log_dir/content_log.txt" \
    | tail -160 \
    || true
fi

echo '###COMPAT_APP_MARKERS'
if [ -f "$log_dir/compat_log.txt" ]; then
  grep -a -E "AppID __APP_ID__|proton-cachyos|proton-8.0-3|Waiting for compat|Command prefix|depends on AppID" "$log_dir/compat_log.txt" \
    | tail -120 \
    || true
fi

echo '###MANIFEST_SUMMARY'
if [ -f "$manifest" ]; then
  grep -E '"(StateFlags|buildid|TargetBuildID|BytesToDownload|BytesDownloaded|BytesToStage|BytesStaged|SizeOnDisk|LastUpdated)"' "$manifest" || true
else
  echo 'missing'
fi
`
  .replaceAll("__APP_ID__", appId)
  .replaceAll("__SINCE__", since)
  .replaceAll("__UNTIL__", until)

const result = await runRemote(remoteScript)
if (result.exitCode !== 0) {
  console.error(result.stderr)
  console.error(result.stdout)
  process.exit(result.exitCode)
}

const sections = parseSections(result.stdout)
const serviceJournal = sections.SERVICE_JOURNAL ?? []
const consoleMarkers = filterSteamWindow(sections.CONSOLE_RESTART_MARKERS ?? [])
const contentMarkers = filterSteamWindow(sections.CONTENT_APP_MARKERS ?? [])
const compatMarkers = filterSteamWindow(sections.COMPAT_APP_MARKERS ?? [])

const guardRefusals = countMatches(
  serviceJournal,
  /refusing Steam Gamepad UI|uimode=4|Gamepad UI/,
)
const serviceStarts = countMatches(serviceJournal, /Started|Starting/)
const serviceStops = countMatches(
  serviceJournal,
  /Stopped|stopping|Main process exited|status=/,
)
const consoleStarts = countMatches(consoleMarkers, /Console Log Start/)
const clientVersions = countMatches(contentMarkers, /Client version:/)
const appCanceled = countMatches(
  contentMarkers,
  new RegExp(`AppID ${appId} update canceled`),
)
const appFullyInstalled = countMatches(
  contentMarkers,
  new RegExp(`AppID ${appId} state changed : Fully Installed`),
)
const appStillUpdating = countMatches(
  contentMarkers,
  new RegExp(`AppID ${appId} state changed : .*Update`),
)
const cachyRegistered = countMatches(compatMarkers, /proton-cachyos/)
const legacyProtonMapping = countMatches(
  compatMarkers,
  /Mapping AppID 1029210 to tool "proton-8.0-3"/,
)

const classification = (() => {
  if (guardRefusals > 0) {
    return "managed-ui-guard-triggered"
  }
  if (serviceStops > 0 || serviceStarts > 1) {
    return "systemd-service-restarted"
  }
  if (consoleStarts > 0 || clientVersions > 0) {
    return "steam-client-reinitialized-without-service-restart"
  }
  return "no-restart-evidence-in-window"
})()

const report = {
  host,
  appId,
  window: { since, until },
  classification,
  counters: {
    guardRefusals,
    serviceStarts,
    serviceStops,
    consoleStarts,
    clientVersions,
    appCanceled,
    appFullyInstalled,
    appStillUpdating,
    cachyRegistered,
    legacyProtonMapping,
  },
  serviceStatus: sections.SERVICE_STATUS ?? [],
  evidence: {
    serviceJournal,
    consoleMarkers: consoleMarkers.slice(-40),
    contentMarkers: contentMarkers.slice(-80),
    compatMarkers: compatMarkers.slice(-40),
    manifestSummary: sections.MANIFEST_SUMMARY ?? [],
  },
}

console.log(JSON.stringify(report, null, 2))
