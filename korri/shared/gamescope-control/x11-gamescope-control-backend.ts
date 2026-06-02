import { execFile } from "node:child_process"
import {
  filterToGamescopeValue,
  type GamescopeControlBackend,
  type GamescopeControlCommandResult,
  type GamescopeControlState,
  type GamescopeMode,
  type GamescopeModeRequest,
  type GamescopeScalingFilter,
  parseGamescopeCardinalProperty,
  parseXrandrCurrentMode,
  validateGamescopeMode,
  valueToGamescopeFilter,
} from "./gamescope-control-protocol"

export interface CommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export type GamescopeControlRunner = (
  command: string,
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv },
) => Promise<CommandResult>

export interface X11GamescopeControlBackendOptions {
  readonly display?: string
  readonly xpropPath?: string
  readonly xrandrPath?: string
  readonly run?: GamescopeControlRunner
  readonly pollIntervalMs?: number
  readonly settleTimeoutMs?: number
}

export function createX11GamescopeControlBackend(
  options: X11GamescopeControlBackendOptions = {},
): GamescopeControlBackend {
  const display = options.display ?? process.env.DISPLAY ?? ":1"
  const xprop = options.xpropPath ?? "xprop"
  const xrandr = options.xrandrPath ?? "xrandr"
  const run = options.run ?? defaultRunner
  const pollIntervalMs = options.pollIntervalMs ?? 50
  const settleTimeoutMs = options.settleTimeoutMs ?? 1000

  const env = { ...process.env, DISPLAY: display }

  return {
    getState,
    setMode,
    setFilter,
    setSharpness,
  }

  async function getState(): Promise<GamescopeControlState> {
    const [mode, props] = await Promise.all([readMode(), readProperties()])
    return { _tag: "state.snapshot", xwaylandMode: mode, ...props }
  }

  async function setMode(
    request: GamescopeModeRequest,
  ): Promise<GamescopeControlCommandResult> {
    const validated = validateGamescopeMode(request)
    await writeCardinalList("GAMESCOPE_XWAYLAND_MODE_CONTROL", [
      0,
      validated.width,
      validated.height,
      validated.allowSuperRes ? 1 : 0,
    ])

    const appliedMode = await waitForMode({
      width: validated.width,
      height: validated.height,
    })
    const applied = await getState()
    return {
      _tag: "command.result",
      command: "mode.set",
      status: appliedMode ? "applied" : "timed-out",
      requested: validated,
      applied: {
        ...applied,
        xwaylandMode: appliedMode ?? applied.xwaylandMode,
      },
      reason: appliedMode ? undefined : "timed out waiting for xrandr readback",
    }
  }

  async function setFilter(
    filter: GamescopeScalingFilter,
  ): Promise<GamescopeControlCommandResult> {
    await writeCardinal(
      "GAMESCOPE_SCALING_FILTER",
      filterToGamescopeValue(filter),
    )
    const applied = await getState()
    return {
      _tag: "command.result",
      command: "filter.set",
      status: applied.filter === filter ? "applied" : "accepted",
      requested: { filter },
      applied,
    }
  }

  async function setSharpness(
    sharpness: number,
  ): Promise<GamescopeControlCommandResult> {
    await writeCardinal("GAMESCOPE_SHARPNESS", sharpness)
    const applied = await getState()
    return {
      _tag: "command.result",
      command: "sharpness.set",
      status: applied.sharpness === sharpness ? "applied" : "accepted",
      requested: { sharpness },
      applied,
    }
  }

  async function readMode(): Promise<GamescopeMode | undefined> {
    const result = await run(xrandr, [], { env })
    if (result.exitCode !== 0) throw commandError(xrandr, result)
    return parseXrandrCurrentMode(result.stdout)
  }

  async function readProperties(): Promise<GamescopeControlState> {
    const result = await run(
      xprop,
      [
        "-root",
        "GAMESCOPE_SCALING_FILTER",
        "GAMESCOPE_SHARPNESS",
        "GAMESCOPE_FSR_FEEDBACK",
      ],
      { env },
    )
    const output = `${result.stdout}\n${result.stderr}`
    const filter = valueToGamescopeFilter(
      parseGamescopeCardinalProperty(output, "GAMESCOPE_SCALING_FILTER"),
    )
    const sharpness = parseGamescopeCardinalProperty(
      output,
      "GAMESCOPE_SHARPNESS",
    )
    const fsrFeedbackValue = parseGamescopeCardinalProperty(
      output,
      "GAMESCOPE_FSR_FEEDBACK",
    )
    return {
      filter,
      sharpness,
      fsrFeedback:
        typeof fsrFeedbackValue === "number"
          ? fsrFeedbackValue !== 0
          : undefined,
    }
  }

  async function waitForMode(
    expected: GamescopeMode,
  ): Promise<GamescopeMode | undefined> {
    const deadline = Date.now() + settleTimeoutMs
    while (Date.now() <= deadline) {
      const mode = await readMode()
      if (mode?.width === expected.width && mode.height === expected.height) {
        return mode
      }
      await sleep(pollIntervalMs)
    }
    return undefined
  }

  function writeCardinal(property: string, value: number): Promise<void> {
    return writeXprop([
      "-root",
      "-f",
      property,
      "32c",
      "-set",
      property,
      String(value),
    ])
  }

  function writeCardinalList(
    property: string,
    values: readonly number[],
  ): Promise<void> {
    return writeXprop([
      "-root",
      "-f",
      property,
      "32c",
      "-set",
      property,
      values.join(", "),
    ])
  }

  async function writeXprop(args: readonly string[]): Promise<void> {
    const result = await run(xprop, args, { env })
    if (result.exitCode !== 0) throw commandError(xprop, result)
  }
}

function defaultRunner(
  command: string,
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { env: options?.env },
      (error, stdout, stderr) => {
        if (
          error &&
          typeof (error as NodeJS.ErrnoException).code === "string"
        ) {
          reject(error)
          return
        }
        resolve({
          stdout,
          stderr,
          exitCode:
            typeof (error as { code?: number } | null)?.code === "number"
              ? ((error as { code: number }).code ?? 0)
              : 0,
        })
      },
    )
  })
}

function commandError(command: string, result: CommandResult): Error {
  return new Error(
    `${command} exited ${result.exitCode}: ${result.stderr || result.stdout}`.trim(),
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
