#!/usr/bin/env bun

interface RemoteResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface SectionMap {
  readonly [name: string]: readonly string[]
}

export interface GamescopeAbortWindowInput {
  readonly appId: string
  readonly serviceJournal: readonly string[]
  readonly steamLogs: readonly string[]
}

export interface GamescopeAbortWindowClassification {
  readonly classification:
    | "gamescope-abort-after-game-running"
    | "gamescope-abort-before-steam-ready"
    | "gamepad-ui-guard-exit"
    | "service-stop-timeout"
    | "normal-game-exit"
    | "no-terminal-signal"
  readonly compositorAbort: boolean
  readonly gameReachedRunning: boolean
  readonly gameExitCausedByAbort: boolean
  readonly assertionLines: readonly string[]
  readonly serviceExitLines: readonly string[]
  readonly reaperLines: readonly string[]
}

export function classifyGamescopeAbortWindow(
  input: GamescopeAbortWindowInput,
): GamescopeAbortWindowClassification {
  const serviceText = input.serviceJournal.join("\n")
  const steamText = input.steamLogs.join("\n")
  const assertionLines = input.serviceJournal.filter(line =>
    /Assertion|assert|abort|SIGABRT|rendervulkan|IWaitable/i.test(line),
  )
  const serviceExitLines = input.serviceJournal.filter(line =>
    /status=6\/ABRT|status=134|SIGABRT|code=killed.*ABRT|Main process exited/i.test(
      line,
    ),
  )
  const reaperLines = input.serviceJournal.filter(line =>
    /gamescopereaper|Killing children|Parent of gamescopereaper/i.test(line),
  )
  const compositorAbort =
    /status=6\/ABRT|status=134|SIGABRT|\bAborted\b/i.test(serviceText) ||
    assertionLines.length > 0
  const gameReachedRunning = new RegExp(
    `Game process added ?: AppID ${escapeRegExp(input.appId)}|SteamLaunch AppId=${escapeRegExp(input.appId)}`,
  ).test(steamText)
  const gameRemoved = new RegExp(
    `Game process removed ?: AppID ${escapeRegExp(input.appId)}`,
  ).test(steamText)
  const guardExit =
    /uimode=4|refusing Steam Gamepad UI|RestartPreventExitStatus=77/i.test(
      serviceText,
    )
  const stopTimeout = /stop timed out|deactivating|TimeoutStop/i.test(
    serviceText,
  )

  const classification = (() => {
    if (guardExit) return "gamepad-ui-guard-exit" as const
    if (stopTimeout && !compositorAbort) return "service-stop-timeout" as const
    if (compositorAbort && gameReachedRunning)
      return "gamescope-abort-after-game-running" as const
    if (compositorAbort) return "gamescope-abort-before-steam-ready" as const
    if (gameRemoved) return "normal-game-exit" as const
    return "no-terminal-signal" as const
  })()

  return {
    classification,
    compositorAbort,
    gameReachedRunning,
    gameExitCausedByAbort:
      compositorAbort && gameReachedRunning && reaperLines.length > 0,
    assertionLines,
    serviceExitLines,
    reaperLines,
  }
}

function parseArgs(argv: readonly string[]): Map<string, string> {
  const args = new Map<string, string>()
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg.startsWith("--") && next && !next.startsWith("--")) {
      args.set(arg.slice(2), next)
      index += 1
    }
  }
  return args
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

async function runRemote(
  sshConfig: string,
  host: string,
  script: string,
): Promise<RemoteResult> {
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

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv)
  const host = args.get("host") ?? "bandai-guest-ip"
  const sshConfig = args.get("ssh-config") ?? "/tmp/bandai-deploy/ssh_config_ip"
  const appId = args.get("app-id") ?? "360740"
  const since = args.get("since") ?? "10 minutes ago"
  const until = args.get("until") ?? "now"
  const steamHome = args.get("steam-home") ?? "/var/lib/korri/steam"

  const remoteScript = String.raw`
set -u
app_id=__APP_ID__
since=__SINCE__
until=__UNTIL__
steam_home=__STEAM_HOME__

printf '###SERVICE_STATUS\n'
systemctl show korri-steam-gamescope.service \
  -p ActiveState -p SubState -p Result -p ExecMainStatus -p ExecMainCode -p NRestarts -p InvocationID \
  2>/dev/null || true

printf '###SERVICE_JOURNAL\n'
journalctl -u korri-steam-gamescope.service --since "$since" --until "$until" --no-pager -o short-iso 2>/dev/null \
  | sed 's/\x1b\[[0-9;]*m//g' \
  | grep -a -E 'Assertion|assert|abort|SIGABRT|ABRT|status=134|status=6|Main process exited|gamescopereaper|Killing children|uimode=4|refusing Steam Gamepad UI|deactivating|TimeoutStop|IWaitable|rendervulkan|vulkan|drm:' \
  || true

printf '###STEAM_LOGS\n'
for log in console_log.txt gameprocess_log.txt; do
  if [ -f "$steam_home/logs/$log" ]; then
    if printf '%s' "$since" | grep -Eq '^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]'; then
      awk -v mark="$since" -v end="$until" '
        /^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\]/ {
          ts = substr($0, 2, 19)
          if (ts >= mark && (end !~ /^[0-9][0-9][0-9][0-9]-/ || ts <= end)) print
          next
        }
        { print }
      ' "$steam_home/logs/$log"
    else
      cat "$steam_home/logs/$log"
    fi \
      | grep -a -E "Game process|SteamLaunch AppId=$app_id|AppID $app_id|proton-cachyos|Exec format|cannot execute binary" \
      | tail -160 \
      || true
  fi
done
`
    .replaceAll("__APP_ID__", shellSingleQuote(appId))
    .replaceAll("__SINCE__", shellSingleQuote(since))
    .replaceAll("__UNTIL__", shellSingleQuote(until))
    .replaceAll("__STEAM_HOME__", shellSingleQuote(steamHome))

  const result = await runRemote(sshConfig, host, remoteScript)
  if (result.exitCode !== 0) {
    console.error(result.stderr)
    console.error(result.stdout)
    return result.exitCode
  }

  const sections = parseSections(result.stdout)
  const classification = classifyGamescopeAbortWindow({
    appId,
    serviceJournal: sections.SERVICE_JOURNAL ?? [],
    steamLogs: sections.STEAM_LOGS ?? [],
  })

  console.log(
    JSON.stringify(
      {
        host,
        appId,
        window: { since, until },
        classification,
        serviceStatus: sections.SERVICE_STATUS ?? [],
        evidence: {
          serviceJournal: (sections.SERVICE_JOURNAL ?? []).slice(-120),
          steamLogs: (sections.STEAM_LOGS ?? []).slice(-120),
        },
      },
      null,
      2,
    ),
  )
  return classification.compositorAbort ? 2 : 0
}

if (import.meta.main) {
  process.exit(await main(Bun.argv))
}
