#!/usr/bin/env bun

import { mkdir } from "node:fs/promises"

interface RemoteResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface AppStep {
  readonly appId: string
  readonly expectedExe: string
  readonly name: string
}

interface ProbeClassification {
  readonly serviceActive: boolean
  readonly steamDesktopPersona: boolean
  readonly steamGamepadPersona: boolean
  readonly gameProcessAdded: boolean
  readonly expectedProcess: boolean
  readonly appLauncherAlive: boolean
  readonly sessionRestoring: boolean
  readonly wrapperRemovedNonTerminal: boolean
  readonly realProtonCachyos: boolean
  readonly screenshotCaptured: boolean
  readonly swayTitleObserved: boolean
  readonly gamescopeAbort: boolean
}

interface StepProof {
  readonly step: number
  readonly app: AppStep
  readonly launchPid: string
  readonly launchMark: string
  readonly screenshotRemotePath: string
  readonly screenshotLocalPath?: string
  readonly classification: ProbeClassification
  readonly holdSatisfied: boolean
  readonly sections: SectionMap
}

interface SectionMap {
  readonly [name: string]: readonly string[]
}

const DEFAULT_SEQUENCE: readonly AppStep[] = [
  { appId: "401710", expectedExe: "Flinthook.exe", name: "Flinthook" },
  { appId: "360740", expectedExe: "Downwell.exe", name: "Downwell" },
  { appId: "200900", expectedExe: "CaveStory+.exe", name: "Cave Story+" },
  { appId: "360740", expectedExe: "Downwell.exe", name: "Downwell" },
]

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

function parseSequence(value: string | undefined): readonly AppStep[] {
  if (!value) return DEFAULT_SEQUENCE
  return value.split(",").map(item => {
    const [appId, expectedExe = `${appId}.exe`, name = appId] = item.split(":")
    return { appId, expectedExe, name }
  })
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

export function classifyProbeTranscript(
  stdout: string,
  app: AppStep,
): ProbeClassification {
  const sections = parseSections(stdout)
  const service = (sections.SERVICE ?? []).join("\n")
  const processEvidence = (sections.PROCESSES ?? []).filter(
    line => !line.includes("awk -v app_id=") && !line.includes("grep -a"),
  )
  const processes = processEvidence.join("\n")
  const consoleLog = (sections.CONSOLE ?? []).join("\n")
  const journal = (sections.JOURNAL ?? []).join("\n")
  const sessiond = (sections.SESSIOND ?? []).join("\n")
  const sway = (sections.SWAY ?? []).join("\n")
  const screenshot = (sections.SCREENSHOT ?? []).join("\n")
  const all = [
    service,
    processes,
    consoleLog,
    journal,
    sessiond,
    sway,
    screenshot,
  ].join("\n")
  const appId = escapeRegExp(app.appId)
  const expectedExe = escapeRegExp(app.expectedExe)

  const expectedProcess = new RegExp(expectedExe, "i").test(processes)
  const swayAppWindow = new RegExp(
    `steam_app_${appId}|${expectedExe}`,
    "i",
  ).test(sway)
  const removalHint = new RegExp(`Game process removed ?: AppID ${appId}`).test(
    consoleLog,
  )

  return {
    serviceActive: /(^|\n)active($|\n)|ActiveState=active/.test(service),
    steamDesktopPersona: /steamwebhelper[^\n]*-uimode=7/.test(processes),
    steamGamepadPersona: /steamwebhelper[^\n]*-uimode=4/.test(processes),
    gameProcessAdded: new RegExp(
      `Game process added ?: AppID ${appId}|SteamLaunch AppId=${appId}`,
    ).test(all),
    expectedProcess,
    appLauncherAlive: new RegExp(`korri-steam-app\\s+${appId}`).test(processes),
    sessionRestoring:
      /\b(restoring|cleanup|cleaning Steam foreground processes|stopping foreground)\b/i.test(
        sessiond,
      ),
    wrapperRemovedNonTerminal:
      removalHint && (expectedProcess || swayAppWindow),
    realProtonCachyos:
      /compatibilitytools\.d\/proton-cachyos-11\.0-20260601-slr-arm64(?:\/.*)?\/proton/.test(
        all,
      ) ||
      /\/nix\/store\/[^\s]*proton-cachyos-arm64[^\s]*\/dist'?\/proton/.test(
        all,
      ),
    screenshotCaptured: /SCREENSHOT_OK/.test(screenshot),
    swayTitleObserved:
      new RegExp(escapeRegExp(app.name), "i").test(sway) ||
      new RegExp(expectedExe, "i").test(sway) ||
      /Steam|gamescope/i.test(sway),
    gamescopeAbort:
      /status=134|Main process exited.*status=134|\bABRT\b|\bAborted\b/.test(
        journal,
      ),
  }
}

export function stepPassed(classification: ProbeClassification): boolean {
  return (
    classification.serviceActive &&
    classification.steamDesktopPersona &&
    !classification.steamGamepadPersona &&
    classification.gameProcessAdded &&
    classification.expectedProcess &&
    classification.appLauncherAlive &&
    !classification.sessionRestoring &&
    classification.realProtonCachyos &&
    classification.screenshotCaptured &&
    !classification.gamescopeAbort
  )
}

export function proofPassed(
  proof: Pick<StepProof, "classification" | "holdSatisfied">,
): boolean {
  return proof.holdSatisfied && stepPassed(proof.classification)
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

async function copyRemoteFile(
  sshConfig: string,
  host: string,
  remotePath: string,
  localPath: string,
): Promise<boolean> {
  const proc = Bun.spawn(
    ["scp", "-F", sshConfig, `${host}:${remotePath}`, localPath],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  return (await proc.exited) === 0
}

function launchScript(app: AppStep): string {
  return String.raw`
set -u
app_id=__APP_ID__
log=/tmp/korri-steam-proof-launch-$app_id.log
mark=$(date '+%Y-%m-%d %H:%M:%S')
echo "MARK=$mark"
nohup /run/current-system/sw/bin/korri-steam-app "$app_id" >"$log" 2>&1 &
echo "PID=$!"
`.replaceAll("__APP_ID__", shellSingleQuote(app.appId))
}

function probeScript(
  app: AppStep,
  screenshotRemotePath: string,
  launchMark: string,
): string {
  return String.raw`
set -u
app_id=__APP_ID__
expected_exe=__EXPECTED_EXE__
screenshot_path=__SCREENSHOT_PATH__
launch_mark=__LAUNCH_MARK__

echo "###SERVICE"
systemctl is-active korri-steam-gamescope.service 2>/dev/null || true
systemctl show korri-steam-gamescope.service \
  -p ActiveState -p SubState -p MainPID -p ExecMainCode -p ExecMainStatus -p Result \
  --no-pager 2>/dev/null || true

echo "###PROCESSES"
ps -eo pid=,stat=,etime=,cmd= 2>/dev/null \
  | awk -v app_id="$app_id" -v expected_exe="$expected_exe" '
    index($0, "awk -v app_id=") { next }
    index($0, "grep -a") { next }
    index($0, "SteamLaunch AppId=" app_id) {print}
    index(tolower($0), tolower(expected_exe)) {print}
    /steamwebhelper|proton-cachyos|korri-steam-app|korri-steam-service-run|gamescope/ {print}
  ' \
  | sed -n '1,220p'

echo "###CONSOLE"
tail -520 /var/lib/korri/steam/logs/console_log.txt 2>/dev/null \
  | awk -v mark="$launch_mark" '
    /^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\]/ {
      if (substr($0, 2, 19) >= mark) print
      next
    }
    { print }
  ' \
  | grep -a -E "Game process|SteamLaunch AppId=$app_id|GameAction \\[AppID $app_id|proton-cachyos|$expected_exe|Exec format|cannot execute binary" \
  | tail -180 || true

echo "###JOURNAL"
journalctl --no-pager -u korri-steam-gamescope.service --since "$launch_mark" 2>/dev/null \
  | grep -a -E "status=|Main process exited|ABRT|Aborted|SteamLaunch AppId=$app_id|AppID $app_id|proton-cachyos|$expected_exe|Exec format|cannot execute binary" \
  | tail -180 || true

echo "###SESSIOND"
systemctl --user is-active korri-sessiond.service 2>/dev/null || true
journalctl --user --no-pager -u korri-sessiond.service --since "$launch_mark" 2>/dev/null \
  | grep -a -E "restor|cleanup|cleaning Steam foreground|foreground|Steam" \
  | tail -120 || true

echo "###SWAY"
swaymsg_bin=/run/current-system/sw/bin/swaymsg
sway_sock=$(/run/current-system/sw/bin/find /run/user -maxdepth 2 -name 'sway-ipc*.sock' 2>/dev/null | sed -n '1p')
if test -x "$swaymsg_bin" && test -n "$sway_sock"; then
  SWAYSOCK="$sway_sock" "$swaymsg_bin" -t get_tree 2>/dev/null \
    | grep -ao '"name":"[^"]*"' \
    | sed -n '1,160p' || true
else
  echo "SWAY_UNAVAILABLE"
fi

echo "###SCREENSHOT"
rm -f "$screenshot_path"
gamescope_bin=$(ps -eo cmd= 2>/dev/null | grep -a '/bin/gamescope' | grep -av grep | sed -n 's#^\([^ ]*/bin/gamescope\).*#\1#p' | sed -n '1p')
gamescope_dir=$(dirname "$gamescope_bin" 2>/dev/null || true)
gamescopectl_bin="$gamescope_dir/gamescopectl"
if test -n "$gamescope_bin" && test -x "$gamescopectl_bin"; then
  if GAMESCOPE_WAYLAND_DISPLAY=gamescope-0 "$gamescopectl_bin" screenshot "$screenshot_path" >/tmp/korri-steam-proof-screenshot.log 2>&1; then
    sleep 4
    if test -s "$screenshot_path"; then
      echo "SCREENSHOT_OK $screenshot_path"
      ls -l "$screenshot_path" 2>/dev/null || true
    else
      echo "SCREENSHOT_FAILED empty-after-gamescopectl $screenshot_path"
      cat /tmp/korri-steam-proof-screenshot.log 2>/dev/null || true
    fi
  else
    echo "SCREENSHOT_FAILED $screenshot_path"
    cat /tmp/korri-steam-proof-screenshot.log 2>/dev/null || true
  fi
else
  echo "SCREENSHOT_FAILED gamescopectl-not-found $gamescopectl_bin"
fi
`
    .replaceAll("__APP_ID__", shellSingleQuote(app.appId))
    .replaceAll("__EXPECTED_EXE__", shellSingleQuote(app.expectedExe))
    .replaceAll("__SCREENSHOT_PATH__", shellSingleQuote(screenshotRemotePath))
    .replaceAll("__LAUNCH_MARK__", shellSingleQuote(launchMark))
}

function resetScript(): string {
  return String.raw`
set -u
/run/wrappers/bin/sudo -n /run/current-system/sw/bin/korri-steam-service-control reset
`
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function proveStep(options: {
  readonly sshConfig: string
  readonly host: string
  readonly app: AppStep
  readonly step: number
  readonly runId: string
  readonly timeoutSeconds: number
  readonly pollSeconds: number
  readonly holdSeconds: number
  readonly artifactDir: string
}): Promise<StepProof> {
  const launch = await runRemote(
    options.sshConfig,
    options.host,
    launchScript(options.app),
  )
  if (launch.exitCode !== 0) {
    throw new Error(
      `launch ${options.app.appId} failed: ${launch.stderr}\n${launch.stdout}`,
    )
  }

  const launchLines = launch.stdout.trim().split("\n")
  const launchMark =
    launchLines.find(line => line.startsWith("MARK="))?.slice("MARK=".length) ??
    new Date().toISOString().slice(0, 19).replace("T", " ")
  const launchPid =
    launchLines.find(line => line.startsWith("PID="))?.slice("PID=".length) ??
    "unknown"
  const screenshotRemotePath = `/tmp/korri-steam-proof-${options.runId}-${options.step}-${options.app.appId}.png`
  let lastProbe = ""
  let lastClassification: ProbeClassification | undefined
  const deadline = Date.now() + options.timeoutSeconds * 1000
  let firstPassedAt: number | undefined
  let holdSatisfied = false
  while (Date.now() <= deadline) {
    const probe = await runRemote(
      options.sshConfig,
      options.host,
      probeScript(options.app, screenshotRemotePath, launchMark),
    )
    lastProbe = probe.stdout
    lastClassification = classifyProbeTranscript(probe.stdout, options.app)
    const now = Date.now()
    if (stepPassed(lastClassification)) {
      firstPassedAt ??= now
      if (now - firstPassedAt >= options.holdSeconds * 1000) {
        holdSatisfied = true
        break
      }
    } else {
      firstPassedAt = undefined
    }
    await Bun.sleep(options.pollSeconds * 1000)
  }

  const localPath = `${options.artifactDir}/${options.runId}-${options.step}-${options.app.appId}.png`
  const copied = await copyRemoteFile(
    options.sshConfig,
    options.host,
    screenshotRemotePath,
    localPath,
  )

  return {
    step: options.step,
    app: options.app,
    launchPid,
    launchMark,
    screenshotRemotePath,
    ...(copied ? { screenshotLocalPath: localPath } : {}),
    classification:
      lastClassification ?? classifyProbeTranscript(lastProbe, options.app),
    holdSatisfied,
    sections: parseSections(lastProbe),
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv)
  const host = args.get("host") ?? "bandai-guest-ip"
  const sshConfig = args.get("ssh-config") ?? "/tmp/bandai-deploy/ssh_config_ip"
  const timeoutSeconds = Number(args.get("timeout-seconds") ?? "120")
  const pollSeconds = Number(args.get("poll-seconds") ?? "5")
  const holdSeconds = Number(args.get("hold-seconds") ?? "75")
  const sequence = parseSequence(args.get("sequence"))
  const runId =
    args.get("run-id") ?? new Date().toISOString().replace(/[:.]/g, "-")
  const artifactDir =
    args.get("artifact-dir") ?? `/tmp/korri-steam-proof-${runId}`
  const resetFirst = args.get("reset-first") !== "false"

  await mkdir(artifactDir, { recursive: true })
  await Bun.write(`${artifactDir}/.keep`, "")
  if (resetFirst) {
    const reset = await runRemote(sshConfig, host, resetScript())
    if (reset.exitCode !== 0) {
      console.error(reset.stderr)
      console.error(reset.stdout)
      return reset.exitCode
    }
  }

  const steps: StepProof[] = []
  for (let index = 0; index < sequence.length; index += 1) {
    const proof = await proveStep({
      sshConfig,
      host,
      app: sequence[index],
      step: index + 1,
      runId,
      timeoutSeconds,
      pollSeconds,
      holdSeconds,
      artifactDir,
    })
    steps.push(proof)
    console.error(
      `[${index + 1}/${sequence.length}] ${proof.app.name} ${proof.app.appId}: ${proofPassed(proof) ? "pass" : "pending/fail"}`,
    )
  }

  const report = {
    host,
    runId,
    artifactDir,
    sequence,
    passed: steps.every(step => proofPassed(step)),
    steps,
  }
  const reportPath = `${artifactDir}/${runId}.json`
  await Bun.write(reportPath, JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify(
      {
        host,
        runId,
        artifactDir,
        reportPath,
        passed: report.passed,
        steps: steps.map(step => ({
          step: step.step,
          appId: step.app.appId,
          name: step.app.name,
          passed: proofPassed(step),
          holdSatisfied: step.holdSatisfied,
          screenshotLocalPath: step.screenshotLocalPath,
          classification: step.classification,
        })),
      },
      null,
      2,
    ),
  )
  return report.passed ? 0 : 1
}

if (import.meta.main) {
  process.exit(await main(Bun.argv))
}
