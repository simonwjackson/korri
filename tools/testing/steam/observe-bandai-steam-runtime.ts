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
const steamHome = args.get("steam-home") ?? "/var/lib/korri/steam"
const appId = args.get("app-id") ?? "1029210"
const expectedExe = args.get("expected-exe") ?? "30XX.exe"
const pollSeconds = Number(args.get("poll-seconds") ?? "45")
const pollIntervalSeconds = Number(args.get("poll-interval-seconds") ?? "5")

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

function classifyTranscript(transcript: string) {
  const realProtonCachyos =
    /compatibilitytools\.d\/proton-cachyos-11\.0-20260601-slr-arm64\/proton/.test(
      transcript,
    )
  const steamLinuxRuntime4 = /SteamLinuxRuntime_4\//.test(transcript)
  const steamLinuxRuntimeSniper = /SteamLinuxRuntime_sniper\//.test(transcript)
  const officialProtonFallback =
    /steamapps\/common\/Proton(?:\s|-)/.test(transcript) && !realProtonCachyos
  const execFormat = /Exec format error|cannot execute binary file/.test(
    transcript,
  )
  const runtimeHelperExecFormat =
    execFormat && /pressure-vessel|pv-adverb|srt-bwrap/.test(transcript)

  const launchChain = (() => {
    if (runtimeHelperExecFormat && steamLinuxRuntime4)
      return "runtime4_helper_failure"
    if (runtimeHelperExecFormat && steamLinuxRuntimeSniper)
      return "sniper_helper_failure"
    if (realProtonCachyos) return "intended_cachyos_arm64"
    if (officialProtonFallback && steamLinuxRuntime4)
      return "official_runtime4_fallback"
    if (steamLinuxRuntimeSniper) return "legacy_sniper_runtime"
    return "no_runtime_observed"
  })()

  return {
    launchChain,
    signals: {
      realProtonCachyos,
      steamLinuxRuntime4,
      steamLinuxRuntimeSniper,
      officialProtonFallback,
      execFormat,
      runtimeHelperExecFormat,
    },
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

const remoteScript = String.raw`
set -u
steam_home=__STEAM_HOME__
app_id=__APP_ID__
expected_exe=__EXPECTED_EXE__
deadline=$(( $(date +%s) + __POLL_SECONDS__ ))
interval=__POLL_INTERVAL_SECONDS__

while [ "$(date +%s)" -le "$deadline" ]; do
  echo "###POLL"
  date '+%Y-%m-%d %H:%M:%S'

  echo "###PROCESSES"
  ps -eo pid=,stat=,etime=,cmd= 2>/dev/null \
    | awk -v app_id="$app_id" -v expected_exe="$expected_exe" '
      index($0, "SteamLaunch AppId=" app_id) {print}
      index($0, expected_exe) {print}
      /SteamLinuxRuntime_|pressure-vessel|pv-adverb|srt-bwrap|proton-cachyos|Proton - Experimental|gamescope|korri-steam-guest/ {print}
    ' \
    | sed -n '1,180p'

  echo "###CONSOLE"
  tail -220 "$steam_home/logs/console_log.txt" 2>/dev/null \
    | grep -a -E "Game process|SteamLaunch AppId=$app_id|SteamLinuxRuntime_|pressure-vessel|pv-adverb|srt-bwrap|proton-cachyos|Proton - Experimental|Exec format|cannot execute binary|$expected_exe" \
    | tail -120 \
    || true

  echo "###JOURNAL"
  journalctl --no-pager -u korri-steam-gamescope.service --since '2 minutes ago' 2>/dev/null \
    | grep -a -E "SteamLinuxRuntime_|pressure-vessel|pv-adverb|srt-bwrap|proton-cachyos|Proton - Experimental|Exec format|cannot execute binary|status=|Main process exited|$expected_exe|AppID $app_id" \
    | tail -120 \
    || true

  sleep "$interval"
done
`
  .replaceAll("__STEAM_HOME__", shellSingleQuote(steamHome))
  .replaceAll("__APP_ID__", shellSingleQuote(appId))
  .replaceAll("__EXPECTED_EXE__", shellSingleQuote(expectedExe))
  .replaceAll("__POLL_SECONDS__", String(pollSeconds))
  .replaceAll("__POLL_INTERVAL_SECONDS__", String(pollIntervalSeconds))

const result = await runRemote(remoteScript)
if (result.exitCode !== 0) {
  console.error(result.stderr)
  console.error(result.stdout)
  process.exit(result.exitCode)
}

const sections = parseSections(result.stdout)
const transcript = [
  ...(sections.PROCESSES ?? []),
  ...(sections.CONSOLE ?? []),
  ...(sections.JOURNAL ?? []),
].join("\n")

const report = {
  host,
  appId,
  expectedExe,
  steamHome,
  poll: { seconds: pollSeconds, intervalSeconds: pollIntervalSeconds },
  classification: classifyTranscript(transcript),
  evidence: {
    processes: (sections.PROCESSES ?? []).slice(-80),
    console: (sections.CONSOLE ?? []).slice(-80),
    journal: (sections.JOURNAL ?? []).slice(-80),
  },
}

console.log(JSON.stringify(report, null, 2))
