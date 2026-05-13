import type { LaunchResult, LaunchSpec } from "@shared/library/launcher"

export type SessiondFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export interface SessiondLaunchClientOptions {
  readonly url: string
  readonly token: string
  readonly fetchImpl?: SessiondFetch
}

export async function launchViaSessiond(
  spec: LaunchSpec,
  options: SessiondLaunchClientOptions,
): Promise<LaunchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response

  try {
    response = await fetchImpl(String(new URL("/launch", options.url)), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-korri-sessiond-token": options.token,
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
