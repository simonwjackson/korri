import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "../moonlight-control-client"

export interface MoonlightControlCommandIo {
  readonly connect?: (socketPath: string) => Promise<MoonlightControlClient>
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
}

export async function runMoonlightControlCommand(
  argv: readonly string[],
  io: MoonlightControlCommandIo = {},
): Promise<number> {
  const command = argv[0]
  const socketPath = parseSocketPath(argv)
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))

  if (!socketPath) {
    writeError("moonlight-control requires --socket <path>")
    return 2
  }

  if (command !== "hello" && command !== "state") {
    writeError("moonlight-control command must be hello or state")
    return 2
  }

  const connect =
    io.connect ?? (path => connectMoonlightControl({ socketPath: path }))
  let client: MoonlightControlClient | undefined
  try {
    client = await connect(socketPath)
    const response =
      command === "hello" ? await client.hello() : await client.state()
    write(JSON.stringify(response, null, 2))
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    client?.close()
  }
}

function parseSocketPath(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--socket")
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  return value && value.length > 0 ? value : undefined
}

if (import.meta.main) {
  runMoonlightControlCommand(Bun.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode
  })
}
