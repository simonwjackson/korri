import { decodeForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"

const DEFAULT_STATUS_URL =
  process.env.KORRI_FOREGROUND_SESSION_STATUS_URL ??
  "http://127.0.0.1:3000/__korri/desktop/foreground-session-status"

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

  if (typeof parsed === "string") {
    writeError(parsed)
    return 2
  }

  try {
    const response = await fetchImpl(parsed.url, {
      method: "GET",
      headers: { accept: "application/json" },
    })
    if (!response.ok) {
      writeError(
        `foreground-session-status request failed with HTTP ${response.status}`,
      )
      return 20
    }
    const decoded = decodeForegroundSessionStatusSnapshot(await response.json())
    write(JSON.stringify(decoded, null, 2))
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isSchemaFailure(message)) {
      writeError(`foreground-session-status status schema failure: ${message}`)
      return 30
    }
    writeError(`foreground-session-status request failed: ${message}`)
    return 20
  }
}

function parseCommand(
  argv: readonly string[],
): { readonly url: string } | string {
  const url = flagValue(argv, "--url") ?? DEFAULT_STATUS_URL
  if (argv.includes("--help") || argv.includes("-h")) {
    return "usage: foreground-session-status [--url <status-url>]"
  }
  return { url }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined
  return argv[index + 1]
}

function isSchemaFailure(message: string): boolean {
  return (
    message.includes("schemaVersion") ||
    message.includes("serverTimestamp") ||
    message.includes("recentEvents") ||
    message.includes("state")
  )
}

if (import.meta.main) {
  process.exit(await runForegroundSessionStatusCommand(process.argv.slice(2)))
}
