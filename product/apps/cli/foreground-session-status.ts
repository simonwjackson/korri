import { decodeForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"

const DEFAULT_STATUS_URL =
  process.env.KORRI_FOREGROUND_SESSION_STATUS_URL ??
  "http://127.0.0.1:3000/__korri/desktop/foreground-session-status"

type ParsedCommand =
  | { readonly _tag: "Run"; readonly url: string }
  | { readonly _tag: "Help"; readonly message: string }
  | { readonly _tag: "Error"; readonly message: string }

export interface ForegroundSessionStatusCommandIo {
  readonly fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
}

export async function runForegroundSessionStatusCommand(
  argv: readonly string[],
  io: ForegroundSessionStatusCommandIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const fetchImpl = io.fetch ?? fetch
  const parsed = parseCommand(argv)

  if (parsed._tag === "Help") {
    write(parsed.message)
    return 0
  }
  if (parsed._tag === "Error") {
    writeError(parsed.message)
    return 2
  }

  let response: Response
  try {
    response = await fetchImpl(parsed.url, {
      method: "GET",
      headers: { accept: "application/json" },
    })
  } catch (error) {
    writeError(
      `foreground-session-status request failed: ${errorMessage(error)}`,
    )
    return 20
  }

  if (!response.ok) {
    writeError(
      `foreground-session-status request failed with HTTP ${response.status}`,
    )
    return 20
  }

  try {
    const decoded = decodeForegroundSessionStatusSnapshot(await response.json())
    write(JSON.stringify(decoded, null, 2))
    return 0
  } catch (error) {
    writeError(
      `foreground-session-status status schema failure: ${errorMessage(error)}`,
    )
    return 30
  }
}

function parseCommand(argv: readonly string[]): ParsedCommand {
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      _tag: "Help",
      message: "usage: foreground-session-status [--url <status-url>]",
    }
  }

  const explicitUrl = flagValue(argv, "--url")
  if (argv.includes("--url") && !explicitUrl) {
    return { _tag: "Error", message: "--url requires a value" }
  }
  return { _tag: "Run", url: explicitUrl ?? DEFAULT_STATUS_URL }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined
  return argv[index + 1]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

if (import.meta.main) {
  process.exit(await runForegroundSessionStatusCommand(process.argv.slice(2)))
}
