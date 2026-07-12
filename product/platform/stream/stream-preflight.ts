import type {
  NumericLeverBoundary,
  StreamBoundaries,
} from "./stream-adaptive-boundaries"

export type StreamPreflightMode = "skip" | "auto" | "required"

export interface StreamPreflightFacts {
  readonly sourceReachable?: boolean
  readonly streamControlReachable?: boolean
  readonly latencyMs?: number
  readonly timedOut?: boolean
  readonly unavailableReason?: string
}

export interface StreamPreflightDecision {
  readonly status: "skipped" | "selected" | "warning" | "rejected"
  readonly reasonCode:
    | "disabled"
    | "no-stream-policy"
    | "excellent-link"
    | "fair-link"
    | "poor-link"
    | "no-facts"
    | "probe-timeout"
    | "source-unreachable"
    | "explicit-startup-unsafe"
    | "floor-binding"
  readonly message: string
  readonly boundaries?: StreamBoundaries
  readonly selectedStartupKbps?: number
  readonly evidence?: Readonly<Record<string, unknown>>
}

const DEFAULT_PLAYABLE_FLOOR_KBPS = 500
const POOR_STARTUP_KBPS = 3_000
const FAIR_STARTUP_KBPS = 6_000
const EXCELLENT_STARTUP_KBPS = 12_000

export function selectStreamPreflightStartup(
  options: {
    readonly mode?: StreamPreflightMode
    readonly boundaries?: StreamBoundaries
    readonly facts?: StreamPreflightFacts
  } = {},
): StreamPreflightDecision {
  const mode = options.mode ?? "auto"
  const boundaries = options.boundaries
  if (mode === "skip") {
    return skipped("disabled", "Stream preflight disabled", boundaries)
  }

  const bitrate = boundaries?.levers.bitrate
  const profile = preflightProfile(options.facts)
  const evidence = preflightEvidence(options.facts)

  if (mode === "required" && profile.status !== "available") {
    return {
      status: "rejected",
      reasonCode: profile.reasonCode,
      message: profile.message,
      ...(boundaries ? { boundaries } : {}),
      evidence,
    }
  }

  if (!bitrate) {
    return skipped(
      "no-stream-policy",
      "Stream preflight found no explicit bitrate policy to fill",
      boundaries,
      evidence,
    )
  }

  const explicitStartup = explicitStartupKbps(bitrate)
  if (explicitStartup !== undefined) {
    if (profile.startupKbps < explicitStartup) {
      const message = `Explicit startup bitrate ${explicitStartup} kbps is above preflight's safe ${profile.startupKbps} kbps profile`
      return {
        status: mode === "required" ? "rejected" : "warning",
        reasonCode: "explicit-startup-unsafe",
        message,
        boundaries,
        selectedStartupKbps: explicitStartup,
        evidence,
      }
    }
    return skipped(
      "no-stream-policy",
      "Explicit startup bitrate is authoritative",
      boundaries,
      evidence,
    )
  }

  const floor = bitrate.floor ?? DEFAULT_PLAYABLE_FLOOR_KBPS
  const ceiling = bitrate.ceiling
  const startup = clampStartup(profile.startupKbps, floor, ceiling)
  const nextBitrate: NumericLeverBoundary = {
    ...bitrate,
    ...(bitrate.floor === undefined ? { floor } : {}),
    startup,
  }
  const next: StreamBoundaries = {
    ...boundaries,
    levers: {
      ...boundaries.levers,
      bitrate: nextBitrate,
    },
  }
  const floorBinding = startup > profile.startupKbps
  return {
    status:
      floorBinding || profile.status !== "available" ? "warning" : "selected",
    reasonCode: floorBinding ? "floor-binding" : profile.reasonCode,
    message: floorBinding
      ? `Configured bitrate floor ${floor} kbps is above preflight's safe ${profile.startupKbps} kbps profile; respecting the floor`
      : `Stream preflight selected ${startup} kbps startup (${profile.label})`,
    boundaries: next,
    selectedStartupKbps: startup,
    evidence,
  }
}

function explicitStartupKbps(
  bitrate: NumericLeverBoundary,
): number | undefined {
  return bitrate.startup ?? bitrate.pinned
}

function clampStartup(
  startup: number,
  floor: number,
  ceiling: number | undefined,
): number {
  return Math.max(
    floor,
    ceiling === undefined ? startup : Math.min(startup, ceiling),
  )
}

function skipped(
  reasonCode: StreamPreflightDecision["reasonCode"],
  message: string,
  boundaries: StreamBoundaries | undefined,
  evidence?: Readonly<Record<string, unknown>>,
): StreamPreflightDecision {
  return {
    status: "skipped",
    reasonCode,
    message,
    ...(boundaries ? { boundaries } : {}),
    ...(evidence ? { evidence } : {}),
  }
}

function preflightProfile(facts: StreamPreflightFacts | undefined): {
  readonly status: "available" | "fallback"
  readonly reasonCode: StreamPreflightDecision["reasonCode"]
  readonly startupKbps: number
  readonly label: string
  readonly message: string
} {
  if (!facts) {
    return {
      status: "fallback",
      reasonCode: "no-facts",
      startupKbps: POOR_STARTUP_KBPS,
      label: "conservative fallback",
      message: "Stream preflight facts are unavailable",
    }
  }
  if (facts.timedOut) {
    return {
      status: "fallback",
      reasonCode: "probe-timeout",
      startupKbps: POOR_STARTUP_KBPS,
      label: "probe timeout fallback",
      message: "Stream preflight timed out",
    }
  }
  if (
    facts.sourceReachable === false ||
    facts.streamControlReachable === false
  ) {
    return {
      status: "fallback",
      reasonCode: "source-unreachable",
      startupKbps: POOR_STARTUP_KBPS,
      label: "source unreachable fallback",
      message: facts.unavailableReason ?? "Stream source is not reachable",
    }
  }
  const latencyMs = facts.latencyMs
  if (latencyMs === undefined || !Number.isFinite(latencyMs)) {
    return {
      status: "fallback",
      reasonCode: "no-facts",
      startupKbps: POOR_STARTUP_KBPS,
      label: "conservative fallback",
      message: "Stream preflight has no latency sample",
    }
  }
  if (latencyMs <= 30) {
    return {
      status: "available",
      reasonCode: "excellent-link",
      startupKbps: EXCELLENT_STARTUP_KBPS,
      label: "excellent link",
      message: `Stream preflight latency ${latencyMs} ms`,
    }
  }
  if (latencyMs <= 80) {
    return {
      status: "available",
      reasonCode: "fair-link",
      startupKbps: FAIR_STARTUP_KBPS,
      label: "fair link",
      message: `Stream preflight latency ${latencyMs} ms`,
    }
  }
  return {
    status: "available",
    reasonCode: "poor-link",
    startupKbps: POOR_STARTUP_KBPS,
    label: "poor link",
    message: `Stream preflight latency ${latencyMs} ms`,
  }
}

function preflightEvidence(
  facts: StreamPreflightFacts | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (!facts) return undefined
  return {
    ...(facts.sourceReachable !== undefined
      ? { sourceReachable: facts.sourceReachable }
      : {}),
    ...(facts.streamControlReachable !== undefined
      ? { streamControlReachable: facts.streamControlReachable }
      : {}),
    ...(facts.latencyMs !== undefined ? { latencyMs: facts.latencyMs } : {}),
    ...(facts.timedOut !== undefined ? { timedOut: facts.timedOut } : {}),
    ...(facts.unavailableReason !== undefined
      ? { unavailableReason: facts.unavailableReason }
      : {}),
  }
}
