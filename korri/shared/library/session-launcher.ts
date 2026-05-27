import { readFile } from "node:fs/promises"
import type {
  Launcher,
  LaunchResult,
  LaunchSpec,
  ManagedLaunchResult,
} from "./launcher"

export interface SessionLauncherOptions {
  readonly url: string
  readonly token?: string
  readonly tokenFile?: string
  readonly fetchImpl?: SessionLauncherFetch
}

export type SessionLauncherFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export function createSessionLauncher(options: SessionLauncherOptions): Launcher {
  return {
    async run(spec) {
      return launchViaSessiond(spec, options)
    },
    async spawn() {
      return unsupportedManagedSessiondLaunch()
    },
  }
}

function unsupportedManagedSessiondLaunch(): ManagedLaunchResult {
  return {
    status: "failed",
    result: {
      status: "failed",
      exitCode: 125,
      stderrTail:
        "managed sessiond launch unsupported: sessiond does not expose child handles yet",
    },
  }
}

export function createSessionLauncherFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Launcher | undefined {
  const url = env.KORRI_SESSIOND_URL
  if (!url) return undefined

  return createSessionLauncher({
    url,
    token: env.KORRI_SESSIOND_TOKEN,
    tokenFile: env.KORRI_SESSIOND_TOKEN_FILE,
  })
}

export async function launchViaSessiond(
  spec: LaunchSpec,
  options: SessionLauncherOptions,
): Promise<LaunchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const token = await resolveToken(options)
  if (!token) {
    return {
      status: "failed",
      exitCode: 126,
      stderrTail:
        "sessiond launch rejected: missing KORRI_SESSIOND_TOKEN or KORRI_SESSIOND_TOKEN_FILE",
    }
  }

  let response: Response
  try {
    response = await fetchImpl(String(new URL("/launch", options.url)), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-korri-sessiond-token": token,
      },
      body: JSON.stringify({ spec }),
    })
  } catch (error) {
    return {
      status: "failed",
      exitCode: 125,
      stderrTail: `sessiond unreachable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (!response.ok) {
    return {
      status: "failed",
      exitCode: response.status === 401 ? 126 : 125,
      stderrTail: `sessiond launch rejected: ${response.status} ${await response.text()}`,
    }
  }

  const body = (await response.json()) as { readonly result?: LaunchResult }
  return body.result ?? { status: "failed", exitCode: 125 }
}

async function resolveToken(
  options: SessionLauncherOptions,
): Promise<string | undefined> {
  if (options.token?.trim()) return options.token.trim()
  if (!options.tokenFile?.trim()) return undefined

  try {
    const raw = await readFile(options.tokenFile, "utf8")
    return raw.trim() || undefined
  } catch {
    return undefined
  }
}
