import {
  connectGamescopeControl,
  type GamescopeControlClient,
} from "@shared/gamescope-control/gamescope-control-client"
import {
  type GamescopeControlCommandMethod,
  type GamescopeScalingFilter,
  isGamescopeControlCommandMethod,
  validateGamescopeFps,
  validateGamescopeMode,
  validateGamescopeSharpness,
} from "@shared/gamescope-control/gamescope-control-protocol"

export interface GamescopeControlCommandIo {
  readonly connect?: (socketPath: string) => Promise<GamescopeControlClient>
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
}

export async function runGamescopeControlCommand(
  argv: readonly string[],
  io: GamescopeControlCommandIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const parsed = parseCommand(argv)
  if (typeof parsed === "string") {
    writeError(parsed)
    return 2
  }

  const connect =
    io.connect ?? (socketPath => connectGamescopeControl({ socketPath }))
  let client: GamescopeControlClient | undefined
  try {
    client = await connect(parsed.socketPath)
    const response = await dispatchCliCommand(client, parsed)
    write(JSON.stringify(response, null, 2))
    return 0
  } catch (error) {
    writeError(errorMessage(error))
    return 1
  } finally {
    client?.close()
  }
}

type ParsedCommand =
  | { readonly command: "hello" | "state"; readonly socketPath: string }
  | {
      readonly command: "mode"
      readonly socketPath: string
      readonly width: number
      readonly height: number
    }
  | {
      readonly command: "filter"
      readonly socketPath: string
      readonly filter: GamescopeScalingFilter
    }
  | {
      readonly command: "sharpness"
      readonly socketPath: string
      readonly sharpness: number
    }
  | {
      readonly command: "fps"
      readonly socketPath: string
      readonly fps: number
    }
  | {
      readonly command: "call"
      readonly socketPath: string
      readonly method: GamescopeControlCommandMethod
      readonly params?: unknown
    }

async function dispatchCliCommand(
  client: GamescopeControlClient,
  command: ParsedCommand,
) {
  switch (command.command) {
    case "hello":
      return client.hello()
    case "state":
      return client.state()
    case "mode":
      return client.setMode({ width: command.width, height: command.height })
    case "filter":
      return client.setFilter({ filter: command.filter })
    case "sharpness":
      return client.setSharpness({ sharpness: command.sharpness })
    case "fps":
      return client.setFps({ fps: command.fps })
    case "call":
      return client.requestCommand(command.method, command.params)
  }
}

function parseCommand(argv: readonly string[]): ParsedCommand | string {
  const socketPath = parseSocketPath(argv)
  if (!socketPath) return "gamescope-control requires --socket <path>"

  const command = argv[0]
  if (command === "hello" || command === "state") return { command, socketPath }

  if (command === "mode") {
    const mode = parseMode(argv[1])
    if (!mode) return "gamescope-control mode requires WIDTHxHEIGHT"
    try {
      const validated = validateGamescopeMode(mode)
      return {
        command,
        socketPath,
        width: validated.width,
        height: validated.height,
      }
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  if (command === "filter") {
    const filter = argv[1]
    if (!isScalingFilter(filter)) {
      return "gamescope-control filter must be linear, nearest, integer, fsr, or nis"
    }
    return { command, socketPath, filter }
  }

  if (command === "sharpness") {
    const sharpness = Number(argv[1])
    try {
      return {
        command,
        socketPath,
        sharpness: validateGamescopeSharpness({ sharpness }),
      }
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  if (command === "fps") {
    const fps = Number(argv[1])
    try {
      return { command, socketPath, fps: validateGamescopeFps({ fps }) }
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  if (command === "call") {
    const method = argv[1]
    if (!isGamescopeControlCommandMethod(method)) {
      return "gamescope-control call requires a valid command method"
    }
    const paramsText = parseCallParamsText(argv)
    if (!paramsText) return { command, socketPath, method }
    try {
      return { command, socketPath, method, params: JSON.parse(paramsText) }
    } catch {
      return "gamescope-control call params must be valid JSON"
    }
  }

  return "gamescope-control command must be hello, state, mode, filter, sharpness, fps, or call"
}

function parseSocketPath(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--socket")
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  return value && value.length > 0 ? value : undefined
}

function parseCallParamsText(argv: readonly string[]): string | undefined {
  const socketIndex = argv.indexOf("--socket")
  const paramsIndex = 2
  if (socketIndex === paramsIndex) return undefined
  return argv[paramsIndex]
}

function parseMode(
  value: string | undefined,
): { readonly width: number; readonly height: number } | undefined {
  const match = value?.match(/^(\d+)x(\d+)$/)
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message
  }
  return String(error)
}

function isScalingFilter(
  value: string | undefined,
): value is GamescopeScalingFilter {
  return (
    value === "linear" ||
    value === "nearest" ||
    value === "integer" ||
    value === "fsr" ||
    value === "nis"
  )
}

if (import.meta.main) {
  runGamescopeControlCommand(Bun.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode
  })
}
