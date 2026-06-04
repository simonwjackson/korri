import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { startGamescopeControlBridge } from "@platform/gamescope-control/gamescope-control-bridge"
import { createX11GamescopeControlBackend } from "@platform/gamescope-control/x11-gamescope-control-backend"

export interface GamescopeControlBridgeCommandIo {
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
}

export async function runGamescopeControlBridgeCommand(
  argv: readonly string[],
  io: GamescopeControlBridgeCommandIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const parsed = parseCommand(argv)
  if (typeof parsed === "string") {
    writeError(parsed)
    return 2
  }

  try {
    await mkdir(dirname(parsed.socketPath), { recursive: true })
    const bridge = await startGamescopeControlBridge({
      socketPath: parsed.socketPath,
      backend: createX11GamescopeControlBackend({
        display: parsed.display,
        xpropPath: parsed.xpropPath,
        xrandrPath: parsed.xrandrPath,
      }),
    })
    write(`gamescope-control bridge listening on ${bridge.socketPath}`)
    await waitForSignal()
    await bridge.close()
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    return 1
  }
}

interface ParsedCommand {
  readonly socketPath: string
  readonly display?: string
  readonly xpropPath?: string
  readonly xrandrPath?: string
}

function parseCommand(argv: readonly string[]): ParsedCommand | string {
  const socketPath = readFlag(argv, "--socket")
  if (!socketPath) return "gamescope-control-bridge requires --socket <path>"
  return {
    socketPath,
    display: readFlag(argv, "--display"),
    xpropPath: readFlag(argv, "--xprop"),
    xrandrPath: readFlag(argv, "--xrandr"),
  }
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  return value && value.length > 0 ? value : undefined
}

function waitForSignal(): Promise<void> {
  return new Promise(resolve => {
    const cleanup = () => {
      process.off("SIGINT", onSignal)
      process.off("SIGTERM", onSignal)
      resolve()
    }
    const onSignal = () => cleanup()
    process.once("SIGINT", onSignal)
    process.once("SIGTERM", onSignal)
  })
}

if (import.meta.main) {
  runGamescopeControlBridgeCommand(Bun.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode
  })
}
