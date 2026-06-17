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
} from "./protocol"

export interface CommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export type GamescopeControlRunner = (
  command: string,
  args: readonly string[],
  options?: {
    readonly env?: NodeJS.ProcessEnv
    readonly timeoutMs?: number
  },
) => Promise<CommandResult>

export interface X11GamescopeControlBackendOptions {
  readonly display?: string
  readonly xpropPath?: string
  readonly xrandrPath?: string
  readonly run?: GamescopeControlRunner
  readonly pollIntervalMs?: number
  readonly settleTimeoutMs?: number
  readonly commandTimeoutMs?: number
}

export function createX11GamescopeControlBackend(
  options: X11GamescopeControlBackendOptions = {},
): GamescopeControlBackend {
  const display = options.display ?? process.env.DISPLAY ?? ":1"
  const xprop = options.xpropPath ?? "xprop"
  const xrandr = options.xrandrPath ?? "xrandr"
  const run = options.run ?? defaultRunner
  const pollIntervalMs = options.pollIntervalMs ?? 50
  const commandTimeoutMs = options.commandTimeoutMs ?? 1000
  const settleTimeoutMs =
    options.settleTimeoutMs ?? Math.max(1500, commandTimeoutMs * 2)

  const env = { ...process.env, DISPLAY: display }

  return {
    getState,
    setMode,
    setFilter,
    setSharpness,
    setFps,
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
    if (!appliedMode) {
      return {
        _tag: "command.result",
        command: "mode.set",
        status: "timed-out",
        requested: validated,
        applied: {},
        reason: "timed out waiting for xrandr readback",
      }
    }

    const readback = await getStateAfterMutation()
    if (readback.error) {
      return {
        _tag: "command.result",
        command: "mode.set",
        status: "readback-failed",
        requested: validated,
        applied: { xwaylandMode: appliedMode },
        reason: readback.error.message,
      }
    }

    return {
      _tag: "command.result",
      command: "mode.set",
      status: "applied",
      requested: validated,
      applied: {
        ...readback.state,
        xwaylandMode: appliedMode,
      },
    }
  }

  async function setFilter(
    filter: GamescopeScalingFilter,
  ): Promise<GamescopeControlCommandResult> {
    await writeCardinal(
      "GAMESCOPE_SCALING_FILTER",
      filterToGamescopeValue(filter),
    )
    const readback = await getStateAfterMutation()
    if (readback.error) {
      return {
        _tag: "command.result",
        command: "filter.set",
        status: "readback-failed",
        requested: { filter },
        applied: {},
        reason: readback.error.message,
      }
    }
    const applied = readback.state
    return {
      _tag: "command.result",
      command: "filter.set",
      status: applied.filter === filter ? "applied" : "readback-mismatch",
      requested: { filter },
      applied,
      reason:
        applied.filter === filter
          ? undefined
          : `filter readback mismatch: requested ${filter}, observed ${applied.filter ?? "unknown"}`,
    }
  }

  async function setFps(fps: number): Promise<GamescopeControlCommandResult> {
    // gamescope reads GAMESCOPE_FPS_LIMIT live (same family as
    // GAMESCOPE_SCALING_FILTER / GAMESCOPE_SHARPNESS). 0 disables the cap.
    await writeCardinal("GAMESCOPE_FPS_LIMIT", fps)
    const readback = await getStateAfterMutation()
    if (readback.error) {
      return {
        _tag: "command.result",
        command: "fps.set",
        status: "readback-failed",
        requested: { fps },
        applied: {},
        reason: readback.error.message,
      }
    }
    const applied = readback.state
    return {
      _tag: "command.result",
      command: "fps.set",
      status: applied.fps === fps ? "applied" : "readback-mismatch",
      requested: { fps },
      applied,
      reason:
        applied.fps === fps
          ? undefined
          : `fps readback mismatch: requested ${fps}, observed ${applied.fps ?? "unknown"}`,
    }
  }

  async function setSharpness(
    sharpness: number,
  ): Promise<GamescopeControlCommandResult> {
    await writeCardinal("GAMESCOPE_SHARPNESS", sharpness)
    const readback = await getStateAfterMutation()
    if (readback.error) {
      return {
        _tag: "command.result",
        command: "sharpness.set",
        status: "readback-failed",
        requested: { sharpness },
        applied: {},
        reason: readback.error.message,
      }
    }
    const applied = readback.state
    return {
      _tag: "command.result",
      command: "sharpness.set",
      status: applied.sharpness === sharpness ? "applied" : "readback-mismatch",
      requested: { sharpness },
      applied,
      reason:
        applied.sharpness === sharpness
          ? undefined
          : `sharpness readback mismatch: requested ${sharpness}, observed ${applied.sharpness ?? "unknown"}`,
    }
  }

  async function readMode(): Promise<GamescopeMode | undefined> {
    const result = await runCommand(xrandr, [], { env })
    if (result.exitCode !== 0) throw commandError(xrandr, result)
    return parseXrandrCurrentMode(result.stdout)
  }

  async function readProperties(): Promise<GamescopeControlState> {
    const result = await runCommand(
      xprop,
      [
        "-root",
        "GAMESCOPE_SCALING_FILTER",
        "GAMESCOPE_SHARPNESS",
        "GAMESCOPE_FSR_FEEDBACK",
        "GAMESCOPE_FPS_LIMIT",
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
    const fps = parseGamescopeCardinalProperty(output, "GAMESCOPE_FPS_LIMIT")
    return {
      filter,
      sharpness,
      fsrFeedback:
        typeof fsrFeedbackValue === "number"
          ? fsrFeedbackValue !== 0
          : undefined,
      ...(fps !== undefined ? { fps } : {}),
    }
  }

  async function waitForMode(
    expected: GamescopeMode,
  ): Promise<GamescopeMode | undefined> {
    const deadline = Date.now() + settleTimeoutMs
    while (Date.now() <= deadline) {
      try {
        const mode = await readMode()
        if (mode?.width === expected.width && mode.height === expected.height) {
          return mode
        }
      } catch {
        // Keep polling until the overall settle timeout expires. A transiently
        // wedged Xwayland/xrandr readback should produce a bounded command
        // result, not wedge the JSON-RPC bridge.
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
    const result = await runCommand(xprop, args, { env })
    if (result.exitCode !== 0) throw commandError(xprop, result)
  }

  async function getStateAfterMutation(): Promise<
    | { readonly state: GamescopeControlState; readonly error?: undefined }
    | { readonly state?: undefined; readonly error: Error }
  > {
    try {
      return { state: await getState() }
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  function runCommand(
    command: string,
    args: readonly string[],
    commandOptions?: { readonly env?: NodeJS.ProcessEnv },
  ): Promise<CommandResult> {
    return withTimeout(
      run(command, args, { ...commandOptions, timeoutMs: commandTimeoutMs }),
      commandTimeoutMs,
      `${command} timed out after ${commandTimeoutMs}ms`,
    )
  }
}

function defaultRunner(
  command: string,
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly timeoutMs?: number },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        env: options?.env,
        timeout: options?.timeoutMs,
        killSignal: "SIGKILL",
      },
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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
