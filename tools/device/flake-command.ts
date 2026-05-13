import { spawnSync } from "node:child_process"
import { createInterface } from "node:readline/promises"

const DEFAULT_APP = "korri-desktop-device"
const REMOTE_PID_FILE = "/tmp/korri-device-run.pid"

export class DeviceFlakeCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "DeviceFlakeCommandError"
  }
}

export interface DeviceFlakeCommandEnv {
  readonly DEVICE_HOST?: string
  readonly DEVICE_SSH_OPTS?: string
  readonly DEVICE_RUN_ENV?: string
  readonly KORRI_FLAKE_REF?: string
  readonly KORRI_SOURCE_HOST?: string
  readonly KORRI_APP?: string
  readonly NIX_BUILDERS?: string
  readonly NIX_MAX_JOBS?: string
  readonly KORRI_ALLOW_DIRTY_FLAKE_RUN?: string
}

export interface DeviceFlakeCommandDeps {
  readonly repoRoot?: () => string | undefined
  readonly sourceHost?: () => string | undefined
}

export type DeviceFlakeExecutionPlan =
  | {
      readonly mode: "local"
      readonly flakeRef: string
      readonly app: string
      readonly command: "env" | "nix"
      readonly args: readonly string[]
      readonly displayCommand: string
    }
  | {
      readonly mode: "ssh"
      readonly flakeRef: string
      readonly app: string
      readonly command: "ssh"
      readonly args: readonly string[]
      readonly remoteCommand: string
      readonly cleanupCommand: "ssh"
      readonly cleanupArgs: readonly string[]
      readonly displayCommand: string
    }

export interface DirtyFlakeCheckInput {
  readonly flakeRef: string
  readonly env?: DeviceFlakeCommandEnv
  readonly isDirty: boolean
  readonly isInteractive: boolean
  readonly confirm?: (message: string) => Promise<boolean>
}

export interface DirtyFlakeCheckResult {
  readonly allowed: boolean
  readonly reason: "not-git-backed" | "clean" | "override" | "confirmed"
}

export interface RunCliDeps extends DeviceFlakeCommandDeps {
  readonly env?: DeviceFlakeCommandEnv
  readonly argv?: readonly string[]
  readonly cwd?: string
  readonly output?: (line: string) => void
  readonly error?: (line: string) => void
  readonly isInteractive?: boolean
  readonly confirm?: (message: string) => Promise<boolean>
  readonly isDirty?: (repoRoot: string) => boolean
  readonly execute?: (
    command: string,
    args: readonly string[],
    plan: DeviceFlakeExecutionPlan,
  ) => Promise<number>
}

export function buildDeviceFlakeExecutionPlan(
  env: DeviceFlakeCommandEnv = {},
  deps: DeviceFlakeCommandDeps = {},
): DeviceFlakeExecutionPlan {
  const destinationHost = optionalEnv(env.DEVICE_HOST)
  const app = optionalEnv(env.KORRI_APP) ?? DEFAULT_APP
  if (app.includes("#")) {
    throw new DeviceFlakeCommandError(
      "InvalidAppSelector",
      "KORRI_APP must be an app name, not a flake selector containing '#'.",
    )
  }
  assertSingleShellWord(app, "KORRI_APP")

  const flakeRef = resolveFlakeRef(env, destinationHost, deps)
  if (flakeRef.includes("#")) {
    throw new DeviceFlakeCommandError(
      "InvalidFlakeRef",
      "KORRI_FLAKE_REF must not include an app selector; set KORRI_APP instead.",
    )
  }
  assertNoWhitespace(flakeRef, "KORRI_FLAKE_REF")

  const nixArgs = buildNixRunArgs({ flakeRef, app, env })
  const runEnv = parseRunEnv(optionalEnv(env.DEVICE_RUN_ENV) ?? "")
  const runCommand =
    runEnv.length > 0
      ? ["env", ...runEnv, "nix", ...nixArgs]
      : ["nix", ...nixArgs]

  if (!destinationHost) {
    return {
      mode: "local",
      flakeRef,
      app,
      command: runCommand[0] === "env" ? "env" : "nix",
      args: runCommand.slice(1),
      displayCommand: renderCommand(
        runCommand[0] ?? "nix",
        runCommand.slice(1),
      ),
    }
  }

  assertSingleShellWord(destinationHost, "DEVICE_HOST")
  const sshOptions = parseShellWords(optionalEnv(env.DEVICE_SSH_OPTS) ?? "")
  const remoteCommand = renderRemoteCleanupCommand(runCommand)
  const cleanupCommand = renderRemotePidCleanupCommand(REMOTE_PID_FILE)
  const args = [...sshOptions, destinationHost, remoteCommand]
  const cleanupArgs = [...sshOptions, destinationHost, cleanupCommand]
  return {
    mode: "ssh",
    flakeRef,
    app,
    command: "ssh",
    args,
    remoteCommand,
    cleanupCommand: "ssh",
    cleanupArgs,
    displayCommand: renderCommand("ssh", args),
  }
}

export async function checkDirtyFlakeRun(
  input: DirtyFlakeCheckInput,
): Promise<DirtyFlakeCheckResult> {
  if (!isCommittedStateFlakeRef(input.flakeRef)) {
    return { allowed: true, reason: "not-git-backed" }
  }

  if (!input.isDirty) {
    return { allowed: true, reason: "clean" }
  }

  if (optionalEnv(input.env?.KORRI_ALLOW_DIRTY_FLAKE_RUN) === "1") {
    return { allowed: true, reason: "override" }
  }

  const message = [
    "The selected Git flake ref will not include uncommitted local changes.",
    `Flake ref: ${input.flakeRef}`,
    "Proceed with committed Git state only?",
  ].join("\n")

  if (!input.isInteractive || !input.confirm) {
    throw new DeviceFlakeCommandError(
      "DirtyGitFlakeRef",
      `${message}\nRefusing non-interactive run. Commit changes, use a local path ref for local-only runs, or set KORRI_ALLOW_DIRTY_FLAKE_RUN=1.`,
    )
  }

  if (await input.confirm(message)) {
    return { allowed: true, reason: "confirmed" }
  }

  throw new DeviceFlakeCommandError(
    "DirtyGitFlakeRefDeclined",
    "Aborted because the selected Git flake ref would omit uncommitted local changes.",
  )
}

export function isCommittedStateFlakeRef(flakeRef: string): boolean {
  return /^(git\+ssh|git\+https|git\+file|git|github|gitlab|sourcehut):/.test(
    flakeRef,
  )
}

export function renderCommand(
  command: string,
  args: readonly string[],
): string {
  return [command, ...args].map(shellQuote).join(" ")
}

export function renderRemoteCleanupCommand(command: readonly string[]): string {
  const cleanupCondition =
    'if [ -n "${' + 'child:-}" ] && kill -0 "$child" 2>/dev/null'
  const cleanup = [
    "cleanup() { status=$?",
    "trap - INT TERM HUP EXIT",
    `${cleanupCondition}; then kill -TERM "-$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null || true`,
    'wait "$child" 2>/dev/null || true',
    "fi",
    'rm -f "$pidfile"',
    'exit "$status"',
    "}",
  ].join("; ")
  const script = [
    'pidfile="$1"',
    "shift",
    "child=",
    cleanup,
    "trap cleanup INT TERM HUP EXIT",
    'setsid "$@" & child=$!',
    'printf "%s\\n" "$child" > "$pidfile"',
    'wait "$child"',
    "status=$?",
    'rm -f "$pidfile"',
    "trap - INT TERM HUP EXIT",
    'exit "$status"',
  ].join("; ")

  return renderCommand("sh", [
    "-lc",
    script,
    "korri-device-run",
    REMOTE_PID_FILE,
    ...command,
  ])
}

export function renderRemotePidCleanupCommand(pidFile: string): string {
  const script = [
    'pidfile="$1"',
    'if [ ! -f "$pidfile" ]; then exit 0; fi',
    'child="$(cat "$pidfile" 2>/dev/null || true)"',
    'rm -f "$pidfile"',
    'if [ -n "$child" ]; then kill -TERM "-$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null || true; fi',
  ].join("; ")
  return renderCommand("sh", ["-lc", script, "korri-device-cleanup", pidFile])
}

export async function runDeviceFlakeCommandCli(
  argv: readonly string[] = Bun.argv.slice(2),
  deps: RunCliDeps = {},
): Promise<number> {
  const output = deps.output ?? (line => console.log(line))
  const error = deps.error ?? (line => console.error(line))
  const env = deps.env ?? readProcessEnv()
  const parsed = parseCliArgs(deps.argv ?? argv)

  if (!parsed) {
    error("Usage: bun run tools/device/flake-command.ts [--print|--dry-run]")
    return 2
  }

  if (parsed.help) {
    output("Usage: bun run tools/device/flake-command.ts [--print|--dry-run]")
    return 0
  }

  try {
    const repoRoot = deps.repoRoot ?? defaultRepoRoot
    const plan = buildDeviceFlakeExecutionPlan(env, {
      repoRoot,
      sourceHost: deps.sourceHost ?? defaultSourceHost,
    })
    const root = repoRoot()
    const isDirty = root ? (deps.isDirty ?? defaultIsDirty)(root) : false

    await checkDirtyFlakeRun({
      flakeRef: plan.flakeRef,
      env,
      isDirty,
      isInteractive: deps.isInteractive ?? process.stdin.isTTY === true,
      confirm: deps.confirm ?? promptYesNo,
    })

    output(`mode=${plan.mode}`)
    output(`flake=${plan.flakeRef}`)
    output(`app=${plan.app}`)
    output(`command=${plan.displayCommand}`)

    if (parsed.print) return 0

    const execute = deps.execute ?? defaultExecute
    return await execute(plan.command, plan.args, plan)
  } catch (errorValue) {
    if (errorValue instanceof DeviceFlakeCommandError) {
      error(`error: ${errorValue.message}`)
      return 1
    }
    throw errorValue
  }
}

function resolveFlakeRef(
  env: DeviceFlakeCommandEnv,
  destinationHost: string | undefined,
  deps: DeviceFlakeCommandDeps,
): string {
  const explicit = optionalEnv(env.KORRI_FLAKE_REF)
  if (explicit) return explicit
  if (!destinationHost) return "."

  const repoRoot = deps.repoRoot?.()
  if (!repoRoot) {
    throw new DeviceFlakeCommandError(
      "MissingRepoRoot",
      "DEVICE_HOST is set and KORRI_FLAKE_REF is unset, but the current Git repository root could not be inferred.",
    )
  }

  const sourceHost = optionalEnv(env.KORRI_SOURCE_HOST) ?? deps.sourceHost?.()
  if (!sourceHost) {
    throw new DeviceFlakeCommandError(
      "MissingSourceHost",
      "DEVICE_HOST is set and KORRI_FLAKE_REF is unset, but the source host could not be inferred. Set KORRI_SOURCE_HOST or KORRI_FLAKE_REF.",
    )
  }

  assertSingleShellWord(sourceHost, "KORRI_SOURCE_HOST")
  return `git+ssh://${sourceHost}${repoRoot}`
}

function buildNixRunArgs(args: {
  readonly flakeRef: string
  readonly app: string
  readonly env: DeviceFlakeCommandEnv
}): readonly string[] {
  const nixArgs = ["run"]
  const builders = optionalEnv(args.env.NIX_BUILDERS)
  if (builders) nixArgs.push("--builders", builders)
  const maxJobs = optionalEnv(args.env.NIX_MAX_JOBS)
  if (maxJobs) nixArgs.push("--max-jobs", maxJobs)
  nixArgs.push(`${args.flakeRef}#${args.app}`)
  return nixArgs
}

function readProcessEnv(): DeviceFlakeCommandEnv {
  return {
    DEVICE_HOST: process.env.DEVICE_HOST,
    DEVICE_SSH_OPTS: process.env.DEVICE_SSH_OPTS,
    DEVICE_RUN_ENV: process.env.DEVICE_RUN_ENV,
    KORRI_FLAKE_REF: process.env.KORRI_FLAKE_REF,
    KORRI_SOURCE_HOST: process.env.KORRI_SOURCE_HOST,
    KORRI_APP: process.env.KORRI_APP,
    NIX_BUILDERS: process.env.NIX_BUILDERS,
    NIX_MAX_JOBS: process.env.NIX_MAX_JOBS,
    KORRI_ALLOW_DIRTY_FLAKE_RUN: process.env.KORRI_ALLOW_DIRTY_FLAKE_RUN,
  }
}

function parseCliArgs(
  argv: readonly string[],
): { readonly print: boolean; readonly help: boolean } | undefined {
  let print = false
  for (const arg of argv) {
    if (arg === "--print" || arg === "--dry-run") {
      print = true
      continue
    }
    if (arg === "--help" || arg === "-h") return { print: false, help: true }
    return undefined
  }
  return { print, help: false }
}

function defaultRepoRoot(): string | undefined {
  return runText("git", ["rev-parse", "--show-toplevel"])
}

function defaultSourceHost(): string | undefined {
  return runText("hostname", ["-f"]) ?? runText("hostname", [])
}

function defaultIsDirty(repoRoot: string): boolean {
  const result = spawnSync("git", ["status", "--porcelain=v1"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new DeviceFlakeCommandError(
      "DirtyCheckFailed",
      "Could not inspect Git status before running a committed-state flake ref.",
    )
  }
  return result.stdout.trim().length > 0
}

function runText(
  command: string,
  args: readonly string[],
  cwd?: string,
): string | undefined {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) return undefined
  const text = result.stdout.trim()
  return text.length > 0 ? text : undefined
}

async function defaultExecute(
  command: string,
  args: readonly string[],
  plan: DeviceFlakeExecutionPlan,
): Promise<number> {
  const proc = Bun.spawn([command, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  let interrupted: NodeJS.Signals | undefined
  let escalation: Timer | undefined
  const forwardSignal = (signal: NodeJS.Signals) => {
    interrupted = signal
    if (plan.mode === "ssh") {
      void runDetached(plan.cleanupCommand, plan.cleanupArgs)
    }
    proc.kill(signal)
    escalation = setTimeout(() => proc.kill("SIGTERM"), 2000)
  }
  process.once("SIGINT", forwardSignal)
  process.once("SIGTERM", forwardSignal)

  try {
    const exitCode = await proc.exited
    if (interrupted && exitCode === 0) return signalExitCode(interrupted)
    return exitCode
  } finally {
    process.off("SIGINT", forwardSignal)
    process.off("SIGTERM", forwardSignal)
    if (escalation) clearTimeout(escalation)
  }
}

async function runDetached(
  command: string,
  args: readonly string[],
): Promise<void> {
  const proc = Bun.spawn([command, ...args], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
  })
  await proc.exited
}

function signalExitCode(signal: NodeJS.Signals): number {
  if (signal === "SIGINT") return 130
  if (signal === "SIGTERM") return 143
  return 1
}

async function promptYesNo(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await rl.question(`${message}\n[y/N] `)
    return /^(y|yes)$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function assertSingleShellWord(value: string, name: string): void {
  if (/\s/.test(value)) {
    throw new DeviceFlakeCommandError(
      "InvalidShellWord",
      `${name} must be a single value without whitespace; put SSH flags in DEVICE_SSH_OPTS.`,
    )
  }
}

function assertNoWhitespace(value: string, name: string): void {
  if (/\s/.test(value)) {
    throw new DeviceFlakeCommandError(
      "InvalidWhitespace",
      `${name} must not contain whitespace.`,
    )
  }
}

function parseRunEnv(input: string): readonly string[] {
  const assignments = parseShellWords(input)
  for (const assignment of assignments) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(assignment)) {
      throw new DeviceFlakeCommandError(
        "InvalidRunEnv",
        "DEVICE_RUN_ENV must contain only KEY=value assignments.",
      )
    }
  }
  return assignments
}

export function parseShellWords(input: string): readonly string[] {
  const words: string[] = []
  let current = ""
  let quote: "'" | '"' | undefined
  let escaped = false
  let active = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      active = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = undefined
      } else if (char === "\\" && quote === '"') {
        escaped = true
      } else {
        current += char
      }
      active = true
      continue
    }

    if (char === "\\") {
      escaped = true
      active = true
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      active = true
      continue
    }

    if (/\s/.test(char)) {
      if (active) {
        words.push(current)
        current = ""
        active = false
      }
      continue
    }

    current += char
    active = true
  }

  if (escaped) {
    throw new DeviceFlakeCommandError(
      "InvalidShellWords",
      "DEVICE_SSH_OPTS ends with an unfinished escape.",
    )
  }

  if (quote) {
    throw new DeviceFlakeCommandError(
      "InvalidShellWords",
      "DEVICE_SSH_OPTS contains an unclosed quote.",
    )
  }

  if (active) words.push(current)
  return words
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./#-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

if (import.meta.main) {
  const exitCode = await runDeviceFlakeCommandCli()
  process.exit(exitCode)
}
