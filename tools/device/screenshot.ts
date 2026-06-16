import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

const DEFAULT_DEVICE = "bandai"
const DEFAULT_HOST = "bandai-guest-ip"
const DEFAULT_SSH_CONFIG = "/tmp/bandai-deploy/ssh_config_ip"
const DEFAULT_WAYLAND_USER = "korri"
const DEFAULT_XDG_RUNTIME_DIR = "/run/user/2000"
const DEFAULT_WAYLAND_DISPLAY = "wayland-1"

export class DeviceScreenshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "DeviceScreenshotError"
  }
}

export interface SwayOutput {
  readonly name: string
  readonly active: boolean
  readonly rect: {
    readonly width: number
    readonly height: number
  }
}

export interface DeviceScreenshotOptions {
  readonly device?: string
  readonly host?: string
  readonly sshConfig?: string
  readonly output?: string
  readonly localPath?: string
  readonly waylandUser?: string
  readonly xdgRuntimeDir?: string
  readonly waylandDisplay?: string
  readonly dryRun?: boolean
}

export interface DeviceScreenshotPlan {
  readonly device: string
  readonly host: string
  readonly sshConfig: string
  readonly requestedOutput: string
  readonly localPath: string
  readonly waylandUser: string
  readonly xdgRuntimeDir: string
  readonly waylandDisplay: string
}

export interface ResolvedDeviceScreenshotPlan extends DeviceScreenshotPlan {
  readonly output: string
  readonly width: number
  readonly height: number
  readonly remotePath: string
  readonly captureScript: string
  readonly scpArgs: readonly string[]
}

export interface DeviceScreenshotResult {
  readonly plan: ResolvedDeviceScreenshotPlan
  readonly outputPath: string
  readonly stdout: string
}

export interface DeviceScreenshotDeps {
  readonly run?: (
    command: string,
    args: readonly string[],
    options?: RunCommandOptions,
  ) => Promise<RunCommandResult>
  readonly now?: () => number
  readonly pid?: () => number
}

export interface RunCommandOptions {
  readonly input?: string
}

export interface RunCommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export function buildDeviceScreenshotPlan(
  options: DeviceScreenshotOptions = {},
): DeviceScreenshotPlan {
  const device = options.device ?? DEFAULT_DEVICE
  if (device !== "bandai") {
    throw new DeviceScreenshotError(
      "UnsupportedDevice",
      `Unsupported device '${device}'. Known device: bandai.`,
    )
  }

  const requestedOutput = options.output ?? "largest"
  const host = options.host ?? DEFAULT_HOST
  const sshConfig = options.sshConfig ?? DEFAULT_SSH_CONFIG
  const localPath = resolve(
    options.localPath ?? `/tmp/${device}-${requestedOutput}-screenshot.png`,
  )
  if (!localPath.endsWith(".png")) {
    throw new DeviceScreenshotError(
      "InvalidLocalPath",
      "Screenshot output path must end with .png.",
    )
  }

  return {
    device,
    host,
    sshConfig,
    requestedOutput,
    localPath,
    waylandUser: options.waylandUser ?? DEFAULT_WAYLAND_USER,
    xdgRuntimeDir: options.xdgRuntimeDir ?? DEFAULT_XDG_RUNTIME_DIR,
    waylandDisplay: options.waylandDisplay ?? DEFAULT_WAYLAND_DISPLAY,
  }
}

export function selectSwayOutput(
  outputs: readonly SwayOutput[],
  requestedOutput: string,
): SwayOutput {
  const activeOutputs = outputs.filter(output => output.active)
  if (activeOutputs.length === 0) {
    throw new DeviceScreenshotError(
      "NoActiveOutputs",
      "No active Sway outputs found.",
    )
  }

  if (requestedOutput === "largest") {
    return [...activeOutputs].sort(
      (left, right) =>
        right.rect.width * right.rect.height -
        left.rect.width * left.rect.height,
    )[0]!
  }

  const selected = activeOutputs.find(output => output.name === requestedOutput)
  if (!selected) {
    throw new DeviceScreenshotError(
      "OutputNotFound",
      `Sway output '${requestedOutput}' not found. Active outputs: ${activeOutputs.map(output => output.name).join(", ")}.`,
    )
  }
  return selected
}

export function parseSwayOutputs(json: string): readonly SwayOutput[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new DeviceScreenshotError(
      "InvalidSwayOutputJson",
      `Could not parse sway output JSON: ${(error as Error).message}`,
    )
  }

  if (!Array.isArray(value)) {
    throw new DeviceScreenshotError(
      "InvalidSwayOutputJson",
      "Sway output JSON was not an array.",
    )
  }

  return value.flatMap(entry => {
    if (!entry || typeof entry !== "object") return []
    const candidate = entry as {
      name?: unknown
      active?: unknown
      rect?: { width?: unknown; height?: unknown }
    }
    if (
      typeof candidate.name !== "string" ||
      typeof candidate.active !== "boolean" ||
      typeof candidate.rect?.width !== "number" ||
      typeof candidate.rect?.height !== "number"
    ) {
      return []
    }
    return [
      {
        name: candidate.name,
        active: candidate.active,
        rect: {
          width: candidate.rect.width,
          height: candidate.rect.height,
        },
      },
    ]
  })
}

export function buildCaptureScript(plan: ResolvedDeviceScreenshotPlan): string {
  return [
    "set -e",
    `out=${shellQuote(plan.remotePath)}`,
    "grim_bin=$(command -v grim || true)",
    '[ -n "$grim_bin" ] || grim_bin=/run/current-system/sw/bin/grim',
    `runuser -u ${shellQuote(plan.waylandUser)} -- env XDG_RUNTIME_DIR=${shellQuote(plan.xdgRuntimeDir)} WAYLAND_DISPLAY=${shellQuote(plan.waylandDisplay)} "$grim_bin" -o ${shellQuote(plan.output)} "$out"`,
    'ls -lh "$out"',
  ].join("\n")
}

export async function captureDeviceScreenshot(
  options: DeviceScreenshotOptions = {},
  deps: DeviceScreenshotDeps = {},
): Promise<DeviceScreenshotResult> {
  const run = deps.run ?? runCommand
  const plan = buildDeviceScreenshotPlan(options)
  const outputsResult = await run(
    "ssh",
    ["-F", plan.sshConfig, plan.host, "bash -s"],
    {
      input: [
        "set -e",
        "sock=$(ls -1 /run/user/2000/sway-ipc.*.sock 2>/dev/null | head -n1)",
        'SWAYSOCK="$sock" swaymsg -t get_outputs',
      ].join("\n"),
    },
  )
  if (outputsResult.exitCode !== 0) {
    throw new DeviceScreenshotError(
      "SwayOutputsFailed",
      outputsResult.stderr || outputsResult.stdout,
    )
  }

  const output = selectSwayOutput(
    parseSwayOutputs(outputsResult.stdout),
    plan.requestedOutput,
  )
  const outputSlug = output.name.replace(/[^A-Za-z0-9_.-]+/g, "-")
  const remotePath = `/tmp/korri-screenshot-${deps.pid?.() ?? process.pid}-${deps.now?.() ?? Date.now()}-${outputSlug}.png`
  const resolvedPlanWithoutScript = {
    ...plan,
    output: output.name,
    width: output.rect.width,
    height: output.rect.height,
    remotePath,
    captureScript: "",
    scpArgs: [
      "-F",
      plan.sshConfig,
      `${plan.host}:${remotePath}`,
      plan.localPath,
    ],
  }
  const resolvedPlan: ResolvedDeviceScreenshotPlan = {
    ...resolvedPlanWithoutScript,
    captureScript: buildCaptureScript(resolvedPlanWithoutScript),
  }

  if (options.dryRun) {
    return {
      plan: resolvedPlan,
      outputPath: plan.localPath,
      stdout: renderPlan(resolvedPlan),
    }
  }

  mkdirSync(dirname(plan.localPath), { recursive: true })
  const captureResult = await run(
    "ssh",
    ["-F", plan.sshConfig, plan.host, "bash -s"],
    {
      input: resolvedPlan.captureScript,
    },
  )
  if (captureResult.exitCode !== 0) {
    throw new DeviceScreenshotError(
      "CaptureFailed",
      captureResult.stderr || captureResult.stdout,
    )
  }

  const scpResult = await run("scp", resolvedPlan.scpArgs)
  await run("ssh", ["-F", plan.sshConfig, plan.host, "rm", "-f", remotePath])
  if (scpResult.exitCode !== 0) {
    throw new DeviceScreenshotError(
      "CopyFailed",
      scpResult.stderr || scpResult.stdout,
    )
  }

  return {
    plan: resolvedPlan,
    outputPath: plan.localPath,
    stdout: `Captured ${output.name} (${output.rect.width}x${output.rect.height}) to ${plan.localPath}`,
  }
}

export async function runDeviceScreenshotCli(
  argv: readonly string[] = process.argv.slice(2),
  deps: DeviceScreenshotDeps = {},
): Promise<number> {
  try {
    const options = parseArgs(argv)
    const result = await captureDeviceScreenshot(options, deps)
    console.log(result.stdout)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

export function parseArgs(argv: readonly string[]): DeviceScreenshotOptions {
  const options: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === "--dry-run") {
      options.dryRun = true
      continue
    }
    if (!arg.startsWith("--")) {
      throw new DeviceScreenshotError(
        "InvalidArgument",
        `Unexpected argument: ${arg}`,
      )
    }
    const eq = arg.indexOf("=")
    if (eq !== -1) {
      options[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) {
      throw new DeviceScreenshotError(
        "MissingArgument",
        `Missing value for --${key}`,
      )
    }
    options[key] = value
    index += 1
  }

  return {
    device: stringOption(options.device),
    host: stringOption(options.host),
    sshConfig: stringOption(options["ssh-config"] ?? options.sshConfig),
    output: stringOption(options.output),
    localPath: stringOption(options["local-path"] ?? options.localPath),
    waylandUser: stringOption(options["wayland-user"]),
    xdgRuntimeDir: stringOption(options["xdg-runtime-dir"]),
    waylandDisplay: stringOption(options["wayland-display"]),
    dryRun: options.dryRun === true,
  }
}

function renderPlan(plan: ResolvedDeviceScreenshotPlan): string {
  return [
    `device: ${plan.device}`,
    `host: ${plan.host}`,
    `output: ${plan.output} (${plan.width}x${plan.height})`,
    `localPath: ${plan.localPath}`,
    `remotePath: ${plan.remotePath}`,
  ].join("\n")
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", chunk => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", chunk => {
      stderr += String(chunk)
    })
    child.on("error", error => {
      resolve({ exitCode: 127, stdout, stderr: stderr + error.message })
    })
    if (options.input !== undefined) child.stdin?.end(options.input)
    child.on("close", code => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

if (import.meta.main) {
  process.exit(await runDeviceScreenshotCli())
}
