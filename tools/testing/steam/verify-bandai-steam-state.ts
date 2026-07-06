#!/usr/bin/env bun

interface RemoteResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface SteamProcess {
  readonly pid: string
  readonly cmdline: string
  readonly uimode?: string
}

interface SwayWorkspace {
  readonly name?: string
  readonly output?: string
  readonly focused?: boolean
  readonly visible?: boolean
}

interface SwayNode {
  readonly id?: number
  readonly type?: string
  readonly name?: string
  readonly app_id?: string | null
  readonly window_properties?: {
    readonly class?: string | null
    readonly instance?: string | null
  }
  readonly fullscreen_mode?: number
  readonly nodes?: readonly SwayNode[]
  readonly floating_nodes?: readonly SwayNode[]
}

interface SwayMatch {
  readonly workspace: string
  readonly id?: number
  readonly name?: string
  readonly appId?: string | null
  readonly className?: string | null
  readonly fullscreenMode?: number
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
const expectedSteamWorkspace = args.get("steam-workspace") ?? "korri:steam-debug"

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

async function remoteText(script: string): Promise<string> {
  const result = await runRemote(script)
  if (result.exitCode !== 0) {
    throw new Error(
      `remote command failed (${result.exitCode})\n${result.stderr}\n${result.stdout}`,
    )
  }
  return result.stdout.trimEnd()
}

async function remoteJson<T>(script: string): Promise<T | null> {
  const text = await remoteText(script)
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

function parseProcesses(text: string): readonly SteamProcess[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const [pid = "", ...rest] = line.split("\t")
      const cmdline = rest.join("\t")
      const uimode = cmdline.match(/ -uimode=(\d+)\b/)?.[1]
      return { pid, cmdline, uimode }
    })
}

function findSwayMatches(root: SwayNode | null): readonly SwayMatch[] {
  if (!root) return []
  const matches: SwayMatch[] = []
  const steamPattern = /steam|gamescope/i

  function walk(node: SwayNode, workspace = "?"): void {
    const currentWorkspace = node.type === "workspace" ? (node.name ?? "?") : workspace
    if (node.type === "con" || node.type === "floating_con") {
      const className = node.window_properties?.class ?? null
      const haystack = [node.name, node.app_id, className, node.window_properties?.instance]
        .filter(Boolean)
        .join(" ")
      if (steamPattern.test(haystack)) {
        matches.push({
          workspace: currentWorkspace,
          id: node.id,
          name: node.name,
          appId: node.app_id,
          className,
          fullscreenMode: node.fullscreen_mode,
        })
      }
    }
    for (const child of node.nodes ?? []) walk(child, currentWorkspace)
    for (const child of node.floating_nodes ?? []) walk(child, currentWorkspace)
  }

  walk(root)
  return matches
}

const currentSystem = await remoteText("readlink /run/current-system 2>/dev/null || true\n")
const serviceState = await remoteText("systemctl is-active korri-steam-gamescope.service 2>/dev/null || true\n")
const interceptMode = await remoteText(
  "busctl --system get-property org.shadowblip.InputPlumber /org/shadowblip/InputPlumber/CompositeDevice0 org.shadowblip.Input.CompositeDevice InterceptMode 2>/dev/null || true\n",
)
const processes = parseProcesses(
  await remoteText(`
for p in /proc/[0-9]*/cmdline; do
  [ -r "$p" ] || continue
  cmd=$(tr '\\0' ' ' < "$p" 2>/dev/null || true)
  case "$cmd" in
    *korri-steam-guest*|*steamrtarm64/steam*|*steamwebhelper*)
      pid="\${p#/proc/}"
      pid="\${pid%/cmdline}"
      printf "%s\\t%s\\n" "$pid" "$cmd"
      ;;
  esac
done
`),
)

const swaySocket = await remoteText(`
for p in $(pgrep -x sway 2>/dev/null || true); do
  tr '\\0' '\\n' < /proc/$p/environ 2>/dev/null | sed -n 's/^SWAYSOCK=//p' | head -n 1
  break
done
`)
const workspaces = swaySocket
  ? await remoteJson<readonly SwayWorkspace[]>(`SWAYSOCK=${JSON.stringify(swaySocket)} swaymsg -t get_workspaces\n`)
  : null
const tree = swaySocket
  ? await remoteJson<SwayNode>(`SWAYSOCK=${JSON.stringify(swaySocket)} swaymsg -t get_tree\n`)
  : null
const swayMatches = findSwayMatches(tree)
const focusedWorkspace = workspaces?.find(workspace => workspace.focused)

const webhelpers = processes.filter(process => process.cmdline.includes("steamwebhelper"))
const liveUimodes = [...new Set(webhelpers.map(process => process.uimode).filter(Boolean))]
const gamescopeProcesses = processes.filter(process =>
  /gamescope .*korri-steam-guest|gamescopereaper .*korri-steam-guest/.test(
    process.cmdline,
  ),
)

const failures: string[] = []
if (serviceState !== "active") {
  failures.push(
    `korri-steam-gamescope.service is ${serviceState || "unknown"}, expected active`,
  )
}
if (interceptMode.trim() !== "u 0") {
  failures.push(
    `InputPlumber InterceptMode is ${interceptMode || "unknown"}, expected u 0`,
  )
}
if (liveUimodes.includes("4")) {
  failures.push("Steam webhelper is in Gamepad/Big Picture UI mode (-uimode=4)")
}
if (webhelpers.length > 0 && !liveUimodes.includes("7")) {
  failures.push(
    `Steam webhelper uimodes are ${liveUimodes.join(",") || "unknown"}, expected 7`,
  )
}
if (swayMatches.some(match => /big picture/i.test(match.name ?? ""))) {
  failures.push("Steam/Gamescope Sway container title is Big Picture")
}
if (!gamescopeProcesses.some(process => process.cmdline.includes("-nobigpicture"))) {
  failures.push("managed Gamescope Steam command does not include -nobigpicture")
}
if (
  !gamescopeProcesses.some(process =>
    process.cmdline.includes("-u GAMESCOPE_WAYLAND_DISPLAY"),
  )
) {
  failures.push(
    "managed Gamescope Steam command does not hide Gamescope SteamOS env hints",
  )
}
if (swayMatches.length === 0) {
  failures.push("no Steam/Gamescope Sway container found")
}
if (
  swayMatches.length > 0 &&
  !swayMatches.some(match => match.workspace === expectedSteamWorkspace)
) {
  failures.push(
    `Steam/Gamescope Sway container is not on ${expectedSteamWorkspace}`,
  )
}

const report = {
  host,
  currentSystem,
  serviceState,
  interceptMode,
  swaySocket: swaySocket || null,
  focusedWorkspace: focusedWorkspace
    ? {
        name: focusedWorkspace.name,
        output: focusedWorkspace.output,
        visible: focusedWorkspace.visible,
      }
    : null,
  steamWorkspaces: swayMatches,
  liveUimodes,
  webhelperPids: webhelpers.map(process => process.pid),
  gamescopePids: gamescopeProcesses.map(process => process.pid),
  failures,
}

console.log(JSON.stringify(report, null, 2))
if (failures.length > 0) process.exit(1)
