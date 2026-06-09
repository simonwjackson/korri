import { evaluateHomeInvariant } from "./sessiond-state"
import { findKorriWindows, type SwayNode } from "./sessiond-sway"

export interface SessiondSmokeStatus {
  readonly state?: { readonly mode?: string }
  readonly renderer?: { readonly kind?: string; readonly pid?: number }
}

export interface SessiondSmokeReport {
  readonly ok: boolean
  readonly issues: readonly string[]
}

export function evaluateSessiondSmoke(input: {
  readonly status: SessiondSmokeStatus
  readonly swayTree?: SwayNode
}): SessiondSmokeReport {
  const issues: string[] = []
  const mode = input.status.state?.mode
  const rendererKind = input.status.renderer?.kind ?? "unknown"

  if (!input.status.renderer?.kind) {
    issues.push("sessiond status did not include a renderer kind")
  }
  if (!mode) issues.push("sessiond status did not include a state mode")
  if (mode !== "home") {
    issues.push(
      `sessiond ${rendererKind} renderer is ${mode ?? "unknown"}, not home`,
    )
  }

  if (input.swayTree) {
    const decisions = evaluateHomeInvariant({
      windows: findKorriWindows(input.swayTree),
    })
    const broken = decisions.filter(decision => decision.kind !== "noop")
    if (broken.length > 0) {
      issues.push(
        `Sway invariant for ${rendererKind} renderer needs repair: ${broken.map(decision => decision.kind).join(", ")}`,
      )
    }
  }

  return { ok: issues.length === 0, issues }
}

async function main() {
  const baseUrl = process.env.KORRI_SESSIOND_SOCKET ?? "http://127.0.0.1:3003"
  const status = (await fetch(new URL("/status", baseUrl)).then(response => {
    if (!response.ok)
      throw new Error(`sessiond status failed: ${response.status}`)
    return response.json()
  })) as SessiondSmokeStatus

  const swayTree = await readSwayTreeIfAvailable()
  const report = evaluateSessiondSmoke({ status, swayTree })

  if (!report.ok) {
    for (const issue of report.issues)
      console.error(`[sessiond-smoke] ${issue}`)
    process.exit(1)
  }

  console.log(
    `[sessiond-smoke] ok: ${status.renderer?.kind ?? "unknown"} renderer home invariant holds`,
  )
}

async function readSwayTreeIfAvailable(): Promise<SwayNode | undefined> {
  const proc = Bun.spawn(["swaymsg", "-t", "get_tree"], {
    stdout: "pipe",
    stderr: "ignore",
  })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) return undefined
  return JSON.parse(stdout) as SwayNode
}

if (import.meta.main) {
  main().catch(error => {
    console.error(
      `[sessiond-smoke] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
