export interface BandaiGamescopeAcceptanceOptions {
  readonly host?: string
  readonly user?: string
  readonly sshPort?: number
  readonly remoteRoot?: string
  readonly socketPath?: string
  readonly output?: string
}

export interface BandaiGamescopeAcceptanceStep {
  readonly name: string
  readonly remote: string
}

export interface BandaiGamescopeAcceptancePlan {
  readonly sshTarget: readonly string[]
  readonly steps: readonly BandaiGamescopeAcceptanceStep[]
}

const DEFAULT_HOST = "bandai"
const DEFAULT_USER = "root"
const DEFAULT_SSH_PORT = 2222
const DEFAULT_SOCKET = "/storage/probe-a-resolution/run/control.sock"
const DEFAULT_OUTPUT = "DSI-2"

export function buildBandaiGamescopeAcceptancePlan(
  options: BandaiGamescopeAcceptanceOptions = {},
): BandaiGamescopeAcceptancePlan {
  const host = options.host ?? DEFAULT_HOST
  const user = options.user ?? DEFAULT_USER
  const sshPort = options.sshPort ?? DEFAULT_SSH_PORT
  const socketPath = options.socketPath ?? DEFAULT_SOCKET
  const output = options.output ?? DEFAULT_OUTPUT
  const remoteRoot =
    options.remoteRoot ?? `/tmp/gamescope-control-bandai-${dateStamp()}`

  const control = (args: string) =>
    `timeout 10 gamescope-control --socket ${shellQuote(socketPath)} ${args}`
  const capture = (name: string) =>
    [
      "SWAYSOCK=$(ls -t /run/user/0/sway-ipc.*.sock | head -1)",
      "XDG_RUNTIME_DIR=/run/user/0",
      "WAYLAND_DISPLAY=wayland-1",
      "SWAYSOCK=$SWAYSOCK",
      `timeout 8 grim -o ${shellQuote(output)} ${shellQuote(`${remoteRoot}/${name}.png`)}`,
    ].join(" ")

  return {
    sshTarget: ["ssh", "-p", String(sshPort), `${user}@${host}`],
    steps: [
      {
        name: "prepare-output-dir",
        remote: `mkdir -p ${shellQuote(remoteRoot)}`,
      },
      { name: "hello", remote: control("hello") },
      { name: "state-before", remote: control("state") },
      { name: "capture-before", remote: capture("00-before") },
      { name: "enable-fsr", remote: control("filter fsr") },
      { name: "sharpness-zero", remote: control("sharpness 0") },
      { name: "capture-fsr-sharp0", remote: capture("01-fsr-sharp0") },
      { name: "mode-960x540", remote: control("mode 960x540") },
      { name: "capture-960x540", remote: capture("02-960x540") },
      { name: "mode-1280x720", remote: control("mode 1280x720") },
      { name: "capture-1280x720", remote: capture("03-1280x720") },
      { name: "mode-640x360", remote: control("mode 640x360") },
      {
        name: "capture-640x360-return",
        remote: capture("04-640x360-return"),
      },
      { name: "state-after", remote: control("state") },
    ],
  }
}

export async function runBandaiGamescopeAcceptanceCommand(
  argv: readonly string[],
  io: {
    readonly write?: (line: string) => void
    readonly writeError?: (line: string) => void
  } = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const parsed = parseArgs(argv)
  if (typeof parsed === "string") {
    writeError(parsed)
    return 2
  }

  const plan = buildBandaiGamescopeAcceptancePlan(parsed)
  if (hasFlag(argv, "--dry-run")) {
    write(JSON.stringify(plan, null, 2))
    return 0
  }

  for (const step of plan.steps) {
    write(`== ${step.name} ==`)
    const code = await runCommand([...plan.sshTarget, step.remote])
    if (code !== 0) {
      writeError(`step ${step.name} failed with exit ${code}`)
      return code
    }
  }
  return 0
}

function parseArgs(
  argv: readonly string[],
): BandaiGamescopeAcceptanceOptions | string {
  const sshPort = readNumberFlag(argv, "--ssh-port")
  if (sshPort !== undefined && sshPort <= 0)
    return "--ssh-port must be positive"
  return {
    host: readFlag(argv, "--host"),
    user: readFlag(argv, "--user"),
    sshPort,
    remoteRoot: readFlag(argv, "--remote-root"),
    socketPath: readFlag(argv, "--socket"),
    output: readFlag(argv, "--output"),
  }
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  return value && value.length > 0 ? value : undefined
}

function readNumberFlag(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const raw = readFlag(argv, flag)
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag)
}

function runCommand(args: readonly string[]): Promise<number> {
  return new Promise(resolve => {
    const proc = Bun.spawn([...args], { stdout: "inherit", stderr: "inherit" })
    proc.exited.then(resolve, () => resolve(1))
  })
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "")
}

if (import.meta.main) {
  runBandaiGamescopeAcceptanceCommand(Bun.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode
  })
}
