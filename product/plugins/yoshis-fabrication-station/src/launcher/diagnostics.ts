import type { CdpClient } from "../../../webpage/src/runtime/cdp"

export interface YfsDirectLaunchState {
  readonly enabled?: boolean
  readonly status?: string
  readonly attempts?: number
  readonly lastError?: string | null
  readonly transport?: string | null
  readonly inputFound?: boolean
  readonly inputCount?: number
  readonly canvasFound?: boolean
  readonly codeLength?: number
}

export interface WaitForYfsReadyOptions {
  readonly timeoutMs?: number
  readonly pollMs?: number
}

export class YfsLaunchDiagnosticError extends Error {
  constructor(
    message: string,
    readonly state: YfsDirectLaunchState | null,
  ) {
    super(message)
    this.name = "YfsLaunchDiagnosticError"
  }
}

export async function readYfsDirectLaunchState(
  cdp: Pick<CdpClient, "evaluate">,
): Promise<YfsDirectLaunchState | null> {
  return await cdp.evaluate<YfsDirectLaunchState | null>(
    "(() => window.__YFS_DIRECT_LAUNCH ?? null)()",
  )
}

export async function waitForYfsReady(
  cdp: Pick<CdpClient, "evaluate">,
  options: WaitForYfsReadyOptions = {},
): Promise<YfsDirectLaunchState> {
  const timeoutMs = options.timeoutMs ?? 45000
  const pollMs = options.pollMs ?? 250
  const deadline = Date.now() + timeoutMs
  let lastState: YfsDirectLaunchState | null = null
  while (Date.now() < deadline) {
    lastState = await readYfsDirectLaunchState(cdp)
    if (lastState?.status === "ready") return lastState
    if (lastState?.status === "failed") {
      throw new YfsLaunchDiagnosticError(
        lastState.lastError ?? "YFS level loader failed",
        lastState,
      )
    }
    await Bun.sleep(pollMs)
  }
  throw new YfsLaunchDiagnosticError(
    lastState
      ? `Timed out waiting for YFS loader; last status=${lastState.status ?? "unknown"}`
      : "Timed out waiting for YFS loader state",
    lastState,
  )
}
